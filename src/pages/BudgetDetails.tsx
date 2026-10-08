import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Zap,
  Check,
  CircleStop,
  RotateCcw,
  Infinity as InfinityIcon,
  ReceiptText,
  Tag,
  Calendar,
  Clock,
} from 'lucide-react';

import { useBudgets, formatBudgetDisplayRange, getBudgetDaysInfo } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { BudgetProgressBar } from '@/components/budgets/BudgetProgressBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/AmountInput';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { cn, sortTransactionsDesc } from '@/lib/utils';
import { type Budget } from '@/services/db/db';

export default function BudgetDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { budgets, updateBudget, deleteBudget, isLoading: isBudgetsLoading } = useBudgets();
  const { transactions, isLoading: isTxLoading } = useTransactions();
  const isLoading = isBudgetsLoading || isTxLoading;
  const { allCategories } = useCategories();
  const expenseCategories = useMemo(() => {
    return allCategories?.filter(c => c.type === 'expense') || [];
  }, [allCategories]);
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const budget = budgets?.find(b => b.id === id);

  // Edit Budget Dialog States
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [isUnlimited, setIsUnlimited] = useState(false);

  // Delete Budget Confirmation Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // End Budget Confirmation Dialog State
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const isNaturallyExpired = budget?.endDate ? budget.endDate < todayStr : false;
  const isBudgetEnded = Boolean(budget?.isEnded || isNaturallyExpired);

  // Period display info (Date Range)
  const dateRange = useMemo(() => {
    if (!budget) return '';
    return formatBudgetDisplayRange(budget.startDate, budget.endDate, {
      isEnded: budget.isEnded,
      endedAt: budget.endedAt,
      language: i18n.language,
      t,
    });
  }, [budget, t, i18n.language]);

  const daysInfo = useMemo(() => {
    if (!budget) return { status: 'ongoing' as const, days: 0 };
    return getBudgetDaysInfo(budget);
  }, [budget]);

  const countdownLabel = useMemo(() => {
    if (daysInfo.status === 'unlimited') {
      return t('budgets.unlimitedPeriod', '無期限');
    }
    if (daysInfo.status === 'ongoing') {
      return daysInfo.days === 0
        ? t('budgets.dueToday', '今日到期')
        : t('budgets.daysRemaining', { count: daysInfo.days, defaultValue: `剩餘 ${daysInfo.days} 天` });
    }
    return t('budgets.startsInDays', { count: daysInfo.days, defaultValue: `${daysInfo.days} 天後開始` });
  }, [daysInfo, t]);

  const startDate = budget?.startDate || '';
  const endDate = budget?.endDate || '';
  const effectiveAmount = budget ? budget.amount : undefined;

  // Filter Transactions in active period belonging to budget categories
  const periodTransactions = useMemo(() => {
    if (!transactions || !budget || !startDate) return [];

    const isUnlimitedBudget = budget.periodType === 'unlimited' || !endDate;
    const effectiveEndDate = isUnlimitedBudget
      ? (budget.isEnded && budget.endedAt ? budget.endedAt : undefined)
      : endDate;

    const categorySet = new Set(budget.categoryIds || []);
    const filtered = transactions.filter(tx => {
      if (tx.deleted) return false;
      if (tx.budgetId === 'none') return false;

      // Explicitly bound to this budget
      if (tx.budgetId === budget.id) {
        return tx.type === 'expense' || tx.type === 'income';
      }

      // If explicitly bound to another budget, exclude
      if (tx.budgetId && tx.budgetId !== 'auto') return false;

      // 退款子交易：若其父交易計入了此預算，則納入此預算的交易中
      if (tx.parentId) {
        const parentTx = transactions.find(t => t.id === tx.parentId);
        if (parentTx && !parentTx.deleted) {
          const parentIsExplicit = parentTx.budgetId === budget.id;
          const parentIsAuto =
            (!parentTx.budgetId || parentTx.budgetId === 'auto') &&
            categorySet.size > 0 &&
            categorySet.has(parentTx.category) &&
            parentTx.date >= startDate &&
            (!effectiveEndDate || parentTx.date <= effectiveEndDate);

          if (parentIsExplicit || parentIsAuto) {
            return true;
          }
        }
      }

      // Auto-match for expenses: within date range and matching categories
      return (
        tx.type === 'expense' &&
        categorySet.size > 0 &&
        categorySet.has(tx.category) &&
        tx.date >= startDate &&
        (!effectiveEndDate || tx.date <= effectiveEndDate)
      );
    });
    return sortTransactionsDesc(filtered);
  }, [transactions, budget, startDate, endDate]);

  // Total spent in active period (undefined during initial load to prevent flashing 0)
  const totalSpent = useMemo(() => {
    if (isLoading || !budget) return undefined;
    const raw = periodTransactions.reduce((sum, tx) => {
      if (tx.type === 'income') {
        return sum - tx.amount;
      }
      return sum + tx.amount;
    }, 0);
    return Math.max(0, raw);
  }, [periodTransactions, isLoading, budget]);

  const percentage =
    totalSpent !== undefined && effectiveAmount && effectiveAmount > 0
      ? Math.min(100, (totalSpent / effectiveAmount) * 100)
      : 0;
  const isOver = totalSpent !== undefined && effectiveAmount !== undefined ? totalSpent > effectiveAmount : false;
  const remaining =
    totalSpent !== undefined && effectiveAmount !== undefined
      ? Math.max(0, effectiveAmount - totalSpent)
      : undefined;

  // Monitored categories resolution
  const monitoredCategoryList = useMemo(() => {
    if (!budget?.categoryIds || budget.categoryIds.length === 0) return [];
    return allCategories?.filter(c => budget.categoryIds?.includes(c.id)) || [];
  }, [budget?.categoryIds, allCategories]);

  // Edit Budget Handlers
  const handleOpenEdit = (b: Budget) => {
    setFormName(b.name);
    setFormAmount(String(b.amount));
    setFormStartDate(b.startDate || '');
    setFormEndDate(b.endDate || '');
    setIsUnlimited(b.periodType === 'unlimited' || !b.endDate);
    setFormCategoryIds(b.categoryIds || []);
    setIsEditDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!budget || !formName.trim() || !formAmount || parseFloat(formAmount) <= 0) return;
    const newAmountNum = parseFloat(formAmount);

    const isCustomOrUnlimited = budget.periodType === 'custom' || budget.periodType === 'unlimited';
    const targetPeriodType = isCustomOrUnlimited
      ? (isUnlimited ? 'unlimited' : 'custom')
      : budget.periodType;

    await updateBudget(budget.id, {
      name: formName.trim(),
      amount: newAmountNum,
      periodType: targetPeriodType,
      startDate: isCustomOrUnlimited ? formStartDate : budget.startDate,
      endDate: isCustomOrUnlimited ? (isUnlimited ? '' : formEndDate) : budget.endDate,
      categoryIds: formCategoryIds,
    });

    setIsEditDialogOpen(false);
  };

  const handleDeleteBudget = async () => {
    if (!budget) return;
    await deleteBudget(budget.id);
    navigate('/budgets');
  };

  const handleEndBudget = async () => {
    if (!budget) return;
    await updateBudget(budget.id, { isEnded: true, endedAt: todayStr });
    setIsEndDialogOpen(false);
    toast.show(t('budgets.budgetEnded'));
  };

  const handleResumeBudget = async () => {
    if (!budget) return;
    await updateBudget(budget.id, { isEnded: false, endedAt: undefined });
    toast.show(t('budgets.budgetResumed'));
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/budgets');
    }
  };

  if (!id) return <Navigate to="/budgets" replace />;

  if (budgets && !budget) {
    return (
      <div className="w-full space-y-4">
        <div className="flex items-center h-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoBack}
            className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4 border border-border rounded-lg bg-card">
          <p className="text-sm font-medium">{t('budgets.budgetNotFound')}</p>
          <Button variant="outline" onClick={() => navigate('/budgets')}>
            {t('budgets.backToBudgets')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Top Header Navigation & Period Info */}
      <div className="space-y-2">
        {/* Row 1: Back + Title and Action Buttons (Always pinned to top-right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoBack}
              className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
              {budget?.name || '\u00A0'}
            </h2>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* End / Resume Button */}
            {budget?.isEnded ? (
              <Button
                variant="outline"
                size="icon"
                onClick={handleResumeBudget}
                title={t('budgets.resumeBudget')}
                aria-label={t('budgets.resumeBudget')}
                className="size-8 text-muted-foreground hover:text-emerald-500 hover:border-emerald-500/30 transition-colors cursor-pointer"
              >
                <RotateCcw className="size-4" />
              </Button>
            ) : !isNaturallyExpired && budget ? (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsEndDialogOpen(true)}
                title={t('budgets.endBudget')}
                aria-label={t('budgets.endBudget')}
                className="size-8 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <CircleStop className="size-4" />
              </Button>
            ) : null}

            {/* Edit Budget Button */}
            <Button
              variant="outline"
              size="icon"
              disabled={!budget}
              onClick={() => budget && handleOpenEdit(budget)}
              title={t('budgets.editBudget')}
              aria-label={t('budgets.editBudget')}
              className="size-8 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-30"
            >
              <Pencil className="size-4" />
            </Button>

            {/* Delete Budget Button */}
            <Button
              variant="outline"
              size="icon"
              disabled={!budget}
              onClick={() => setIsDeleteDialogOpen(true)}
              title={t('budgets.deleteBudget')}
              aria-label={t('budgets.deleteBudget')}
              className="size-8 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer disabled:opacity-30"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Period & Status Badges */}
        <div className="flex items-center gap-1.5 flex-wrap pl-7 min-h-[22px]">
          {isBudgetEnded ? (
            <>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest bg-muted/60 text-muted-foreground border border-border shrink-0">
                {t('budgets.statusEnded')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-muted/60 text-muted-foreground border-border shrink-0">
                <Calendar className="h-2.5 w-2.5 opacity-70" />
                <span>{dateRange}</span>
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-muted/60 text-muted-foreground border-border shrink-0">
                <Calendar className="h-2.5 w-2.5 opacity-70" />
                <span>{dateRange}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-muted/60 text-muted-foreground border-border shrink-0">
                <Clock className="h-2.5 w-2.5 opacity-70" />
                <span>{countdownLabel}</span>
              </span>
            </>
          )}

          {budget?.ruleId && (
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest border border-border bg-muted/60 text-muted-foreground shrink-0">
              <Zap className="h-2.5 w-2.5 opacity-70" />
              <span>{t('budgets.ruleStrategy')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Primary Budget Overview Card */}
      <div className="border border-border rounded-lg p-5 sm:p-6 bg-card text-card-foreground space-y-4">
        {/* Spent vs Target */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t('budgets.spent')}
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <AmountDisplay
                amount={totalSpent}
                baseCurrency={activeLedger?.baseCurrency}
                type="neutral"
                className={cn(
                  'text-2xl sm:text-3xl font-mono tracking-tight font-bold',
                  isOver ? 'text-destructive' : 'text-foreground'
                )}
              />
              <span className="text-sm sm:text-base text-muted-foreground font-mono">
                /{' '}
                <AmountDisplay
                  amount={effectiveAmount}
                  baseCurrency={activeLedger?.baseCurrency}
                  type="neutral"
                />
              </span>
            </div>
          </div>

          {/* Over / Remaining Badge */}
          <div className="sm:text-right">
            {isOver ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs font-mono font-medium">
                <span>{t('budgets.overBudget')}</span>
                <AmountDisplay
                  amount={totalSpent !== undefined && effectiveAmount !== undefined ? totalSpent - effectiveAmount : undefined}
                  baseCurrency={activeLedger?.baseCurrency}
                  type="neutral"
                />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground font-mono">
                <span>{t('budgets.remaining')}: </span>
                <span className="text-foreground font-semibold">
                  <AmountDisplay
                    amount={remaining}
                    baseCurrency={activeLedger?.baseCurrency}
                    type="neutral"
                  />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <BudgetProgressBar
          budgetKey={budget?.id || id || ''}
          percentage={percentage}
          isOver={isOver}
          variant="primary"
          heightClass="h-2"
        />

        {/* Monitored Categories Chips */}
        {monitoredCategoryList.length > 0 && (
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="uppercase tracking-widest font-medium">
                {t('budgets.monitoredCategories')}
              </span>
              <span>
                {t('budgets.categoriesSelected', { count: monitoredCategoryList.length })}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {monitoredCategoryList.map(cat => (
                <span
                  key={cat.id}
                  className="text-xs px-2.5 py-1 rounded-md border border-border bg-muted/40 text-foreground font-medium"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Period Transactions List Header & Container */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('budgets.periodTransactions')} ({periodTransactions.length})
          </h3>
        </div>

        {!budgets || !transactions ? (
          <div className="border border-border rounded-lg h-36 bg-card/40 flex items-center justify-center text-xs font-mono text-muted-foreground/60" />
        ) : (
          <GroupedTransactionList
            transactions={periodTransactions}
            calcDailyBalance={(dayTxs) => {
              return dayTxs.reduce((acc, t) => {
                if (t.type === 'income') {
                  return acc - t.amount;
                }
                return acc + t.amount;
              }, 0);
            }}
            emptyState={
              <div className="border border-border rounded-lg p-10 text-center bg-card space-y-3">
                <div className="size-10 rounded-full border border-border bg-muted/30 flex items-center justify-center mx-auto text-muted-foreground/60">
                  {monitoredCategoryList.length > 0 ? (
                    <ReceiptText className="size-5" />
                  ) : (
                    <Tag className="size-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t('budgets.noTransactions', '此期間尚無任何支出交易')}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    {monitoredCategoryList.length > 0
                      ? t('budgets.noTransactionsWithCategoriesDesc', '設定的監控分類在該期間內尚未產生任何支出紀錄。')
                      : t('budgets.noTransactionsNoCategoriesDesc', '此預算未設定監控分類，您可以編輯預算加入分類自動統計，或於記帳時手動指定歸屬此預算。')}
                  </p>
                </div>
                {monitoredCategoryList.length === 0 && (
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!budget}
                      onClick={() => budget && handleOpenEdit(budget)}
                      className="gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <Pencil className="size-3.5" />
                      <span>{t('budgets.configureMonitoredCategories', '設定監控分類')}</span>
                    </Button>
                  </div>
                )}
              </div>
            }
          />
        )}
      </div>

      {/* Edit Budget Primary Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.editBudget')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4 overflow-y-auto overflow-x-hidden px-1 overscroll-contain">
            {/* Budget Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.name')}
              </label>
              <Input
                placeholder={t('budgets.namePlaceholder')}
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>

            {/* Target Amount */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.targetAmount')}
              </label>
              <AmountInput
                placeholder={t('budgets.targetAmount')}
                value={formAmount}
                onValueChange={setFormAmount}
              />
            </div>

            {/* Custom or Unlimited Range Date Controls */}
            {(budget?.periodType === 'custom' || budget?.periodType === 'unlimited') && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('budgets.startDate')}</label>
                  <DatePicker
                    value={formStartDate}
                    onChange={setFormStartDate}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('budgets.endDate')}</label>
                  {isUnlimited ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsUnlimited(false);
                        if (!formEndDate) setFormEndDate(todayStr);
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center justify-between text-sm font-mono transition-colors cursor-pointer select-none"
                    >
                      <span className="italic">{t('budgets.manualEnd')}</span>
                      <InfinityIcon className="size-4 opacity-60" />
                    </button>
                  ) : (
                    <DatePicker
                      value={formEndDate}
                      onChange={val => {
                        setFormEndDate(val);
                        setIsUnlimited(false);
                      }}
                    />
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant={isUnlimited ? "default" : "outline"}
                    onClick={() => {
                      const next = !isUnlimited;
                      setIsUnlimited(next);
                      if (next) {
                        setFormEndDate('');
                      } else if (!formEndDate) {
                        setFormEndDate(todayStr);
                      }
                    }}
                    className="w-full h-7 text-xs gap-1.5 cursor-pointer font-normal"
                  >
                    <InfinityIcon className="size-3.5" />
                    <span>{t('budgets.noEndDate')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Category Monitoring Selection */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('budgets.categories')}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {formCategoryIds.length === 0
                    ? t('budgets.noCategoriesSelected')
                    : t('budgets.categoriesSelected', { count: formCategoryIds.length })}
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 flex flex-wrap gap-1.5 bg-background">
                {expenseCategories.length > 0 ? (
                  expenseCategories.map(cat => {
                    const isSelected = formCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setFormCategoryIds(prev =>
                            isSelected ? prev.filter(cId => cId !== cat.id) : [...prev, cat.id]
                          );
                        }}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 cursor-pointer',
                          isSelected
                            ? 'bg-foreground text-background border-foreground font-medium'
                            : 'border-border bg-card text-card-foreground hover:bg-muted'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        <span>{cat.name}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="w-full py-4 text-center text-xs text-muted-foreground">
                    {t('budgets.noCategoriesAvailable')}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                {t('budgets.categoriesHint', '勾選分類後，相關支出將自動納入預算；未設定亦可於記帳時手動指定。')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              onClick={handleSaveBudget}
              disabled={
                !formName.trim() ||
                !formAmount ||
                parseFloat(formAmount) <= 0 ||
                ((budget?.periodType === 'custom' || budget?.periodType === 'unlimited') && (
                  !formStartDate ||
                  (!isUnlimited && (!formEndDate || formStartDate > formEndDate))
                ))
              }
            >
              {t('budgets.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Budget Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.deleteBudget')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed py-2">
            {t('budgets.deleteBudgetConfirm')}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDeleteBudget}
              className="cursor-pointer"
            >
              {t('budgets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End Budget Confirmation Dialog */}
      <Dialog open={isEndDialogOpen} onOpenChange={setIsEndDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.endBudget')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed py-2">
            {t('budgets.endBudgetConfirm')}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              variant="default"
              onClick={handleEndBudget}
              className="cursor-pointer"
            >
              {t('budgets.confirmEnd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
