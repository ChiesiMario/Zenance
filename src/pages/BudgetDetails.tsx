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
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { cn, sortTransactionsDesc, formatTransactionDateHeader } from '@/lib/utils';
import { type Budget } from '@/services/db/db';

export default function BudgetDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { budgets, updateBudget, deleteBudget } = useBudgets();
  const { transactions } = useTransactions();
  const { allCategories } = useCategories();
  const expenseCategories = useMemo(() => {
    return allCategories?.filter(c => c.type === 'expense') || [];
  }, [allCategories]);
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { wallets } = useAccounts();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const budget = budgets?.find(b => b.id === id);

  // Selected Transaction for Dialog
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

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
  const effectiveAmount = budget?.amount ?? 0;

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

  // Total spent in active period
  const totalSpent = useMemo(() => {
    const raw = periodTransactions.reduce((sum, tx) => {
      if (tx.type === 'income') {
        return sum - tx.amount;
      }
      return sum + tx.amount;
    }, 0);
    return Math.max(0, raw);
  }, [periodTransactions]);

  const percentage = effectiveAmount > 0 ? Math.min(100, (totalSpent / effectiveAmount) * 100) : 0;
  const isOver = totalSpent > effectiveAmount;
  const remaining = Math.max(0, effectiveAmount - totalSpent);

  // Grouped transactions by date (newest first)
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof periodTransactions> = {};
    periodTransactions.forEach(tx => {
      if (!groups[tx.date]) {
        groups[tx.date] = [];
      }
      groups[tx.date].push(tx);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(dateStr => {
        const dayTxs = sortTransactionsDesc(groups[dateStr]);
        const dayTotal = dayTxs.reduce((acc, t) => {
          if (t.type === 'income') {
            return acc - t.amount;
          }
          return acc + t.amount;
        }, 0);
        return {
          date: dateStr,
          transactions: dayTxs,
          dayTotal,
        };
      });
  }, [periodTransactions]);

  // Date header formatting
  const formatDateHeader = (dateStr: string) => {
    return formatTransactionDateHeader(dateStr, t, i18n.language);
  };

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

  if (!id) return <Navigate to="/budgets" replace />;

  if (!budgets || !transactions) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground font-mono">
        {t('common.loading')}
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <p className="text-sm font-medium">{t('budgets.budgetNotFound')}</p>
        <Button variant="outline" onClick={() => navigate('/budgets')}>
          {t('budgets.backToBudgets')}
        </Button>
      </div>
    );
  }

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/budgets');
    }
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      {/* Top Header Navigation & Period Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoBack}
            className="h-8 w-8 -ml-2 mt-0.5 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
              {budget.name}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
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

              {budget.ruleId && (
                <button
                  type="button"
                  onClick={() => navigate('/budgets?tab=rules')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                  title={t('budgets.tabRules')}
                >
                  <Zap className="h-2.5 w-2.5 text-amber-500" />
                  <span>{t('budgets.ruleStrategy')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          {/* End / Resume Button */}
          {budget.isEnded ? (
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
          ) : !isNaturallyExpired ? (
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
            onClick={() => handleOpenEdit(budget)}
            title={t('budgets.editBudget')}
            aria-label={t('budgets.editBudget')}
            className="size-8 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Pencil className="size-4" />
          </Button>

          {/* Delete Budget Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsDeleteDialogOpen(true)}
            title={t('budgets.deleteBudget')}
            aria-label={t('budgets.deleteBudget')}
            className="size-8 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer"
          >
            <Trash2 className="size-4" />
          </Button>
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
                  amount={totalSpent - effectiveAmount}
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
        <div className="h-2 w-full bg-muted overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full transition-all duration-700 ease-out',
              isOver ? 'bg-destructive' : 'bg-primary'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

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

        {groupedTransactions.length === 0 ? (
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
                  onClick={() => handleOpenEdit(budget)}
                  className="gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                  <span>{t('budgets.configureMonitoredCategories', '設定監控分類')}</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
            <div className="space-y-4">
              {groupedTransactions.map(group => (
                <div
                  key={group.date}
                  className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground flex flex-col"
                >
                  {/* Date Sticky Header */}
                  <div className="sticky top-0 z-10 px-4 py-2.5 bg-background/80 backdrop-blur-md border-b border-border text-xs uppercase tracking-widest text-muted-foreground flex justify-between items-center">
                    <span>{formatDateHeader(group.date)}</span>
                    <div className="font-mono text-muted-foreground/80">
                      <AmountDisplay
                        amount={group.dayTotal}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="font-normal"
                      />
                    </div>
                  </div>

                  {/* Day Transactions */}
                  <div className="divide-y divide-border">
                    {group.transactions.map(tx => {
                      const category = allCategories?.find(c => c.id === tx.category);
                      return (
                        <button
                          key={tx.id}
                          onClick={() => setSelectedTransactionId(tx.id)}
                          className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                        >
                          <div className="flex flex-col justify-center min-w-0 pr-4 overflow-hidden">
                            <div className="h-5 flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium leading-none truncate">
                                {tx.isWriteOff || (category?.name && (category.name.includes('差額吸收') || category.name.includes('差额吸收') || category.name === '抹零'))
                                  ? t('reimbursements.writeOffCategory', '抹零')
                                  : (category?.name || t('common.uncategorized'))}
                              </span>
                              <ReimbursementBadge transaction={tx} />
                            </div>
                            {tx.note && (
                              <div className="h-4 flex items-center text-xs text-muted-foreground truncate mt-1">
                                {tx.note}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end justify-center shrink-0">
                            <div className="h-5 flex items-center justify-end">
                              <AmountDisplay
                                amount={tx.amount}
                                originalCurrency={tx.originalCurrency}
                                baseCurrency={activeLedger?.baseCurrency}
                                type={tx.type === 'income' ? 'income' : 'expense'}
                                className="text-sm font-mono leading-none"
                              />
                            </div>
                            {(() => {
                              const wallet = wallets?.find(w => w.id === tx.accountId) || wallets?.find(w => w.id === tx.toAccountId);
                              if (!wallet?.name) return null;
                              return (
                                <div className="h-4 flex items-center justify-end text-xs text-muted-foreground truncate mt-1 max-w-[120px]">
                                  {wallet.name}
                                </div>
                              );
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Transaction Details Dialog */}
      {selectedTransactionId && (
        <TransactionDetailsDialog
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}

      {/* Edit Budget Primary Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.editBudget')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
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
              <Input
                type="number"
                placeholder={t('budgets.targetAmount')}
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
              />
            </div>

            {/* Custom or Unlimited Range Date Controls */}
            {(budget.periodType === 'custom' || budget.periodType === 'unlimited') && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('budgets.startDate')}</label>
                  <DatePicker
                    value={formStartDate}
                    onChange={setFormStartDate}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">{t('budgets.endDate')}</label>
                    <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                      <input
                        type="checkbox"
                        checked={isUnlimited}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsUnlimited(checked);
                          if (checked) {
                            setFormEndDate('');
                          } else if (!formEndDate) {
                            setFormEndDate(todayStr);
                          }
                        }}
                        className="rounded border-border size-3 cursor-pointer"
                      />
                      <span>{t('budgets.noEndDate')}</span>
                    </label>
                  </div>
                  {isUnlimited ? (
                    <div className="h-9 px-3 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground flex items-center justify-between text-xs font-mono select-none">
                      <span className="italic">{t('budgets.manualEnd')}</span>
                      <InfinityIcon className="size-3.5 opacity-60" />
                    </div>
                  ) : (
                    <DatePicker
                      value={formEndDate}
                      onChange={val => {
                        setFormEndDate(val);
                        setIsUnlimited(false);
                      }}
                    />
                  )}
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
                {expenseCategories.map(cat => {
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
                })}
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
                ((budget.periodType === 'custom' || budget.periodType === 'unlimited') && (
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
