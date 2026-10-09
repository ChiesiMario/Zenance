import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Zap,
  CircleStop,
  RotateCcw,
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
import { BudgetFormDialog } from '@/components/budgets/BudgetFormDialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { cn, sortTransactionsDesc } from '@/lib/utils';

export default function BudgetDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();

  const { budgets, updateBudget, deleteBudget, isLoading: isBudgetsLoading } = useBudgets();
  const { transactions, isLoading: isTxLoading } = useTransactions();
  const isLoading = isBudgetsLoading || isTxLoading;
  const { allCategories } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const budget = budgets?.find(b => b.id === id);

  // Edit Budget Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
  const handleOpenEdit = () => {
    setIsEditDialogOpen(true);
  };

  const handleDeleteBudget = async () => {
    if (!budget) return;
    const confirmed = await confirm({
      title: t('budgets.deleteBudget'),
      description: t('budgets.deleteBudgetConfirm'),
      confirmText: t('budgets.delete'),
      cancelText: t('budgets.cancel'),
      variant: 'destructive',
    });
    if (confirmed) {
      await deleteBudget(budget.id);
      navigate('/budgets');
    }
  };

  const handleEndBudget = async () => {
    if (!budget) return;
    const confirmed = await confirm({
      title: t('budgets.endBudget'),
      description: t('budgets.endBudgetConfirm'),
      confirmText: t('budgets.confirmEnd'),
      cancelText: t('budgets.cancel'),
    });
    if (confirmed) {
      await updateBudget(budget.id, { isEnded: true, endedAt: todayStr });
      toast.show(t('budgets.budgetEnded'));
    }
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
                onClick={handleEndBudget}
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
              onClick={handleOpenEdit}
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
              onClick={handleDeleteBudget}
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
                      onClick={handleOpenEdit}
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
      <BudgetFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        mode="edit"
        budget={budget}
      />
    </div>
  );
}
