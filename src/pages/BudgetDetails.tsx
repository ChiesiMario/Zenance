import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Zap,
  Check,
} from 'lucide-react';
import { isToday, isYesterday, parseISO, format } from 'date-fns';

import { useBudgets } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { cn } from '@/lib/utils';
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

  // Delete Budget Confirmation Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Period display info (Title & Date Range with Pangu Spacing)
  const periodInfo = useMemo(() => {
    if (!budget) return { title: '', dateRange: '' };

    let title = '';
    if (budget.periodType === 'monthly') {
      const parts = (budget.periodKey || budget.startDate.substring(0, 7)).split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const dateObj = new Date(y, m - 1, 1);
      const isCurYear = y === new Date().getFullYear();
      let str = dateObj.toLocaleDateString(i18n.language, {
        year: isCurYear ? undefined : 'numeric',
        month: 'long',
      });
      if (i18n.language.startsWith('zh')) {
        str = str.replace(/([0-9a-zA-Z])([一-龥])/g, '$1 $2').replace(/([一-龥])([0-9a-zA-Z])/g, '$1 $2');
      }
      title = str;
    } else if (budget.periodType === 'yearly') {
      const y = budget.periodKey || budget.startDate.substring(0, 4);
      title = i18n.language.startsWith('zh') ? `${y} 年` : y;
    } else {
      title = t('budgets.tabCustom');
    }

    const dateRange = `${budget.startDate} ~ ${budget.endDate}`;
    return { title, dateRange };
  }, [budget, i18n.language, t]);

  const startDate = budget?.startDate || '';
  const endDate = budget?.endDate || '';
  const effectiveAmount = budget?.amount ?? 0;

  // Filter Transactions in active period belonging to budget categories
  const periodTransactions = useMemo(() => {
    if (!transactions || !budget || !startDate || !endDate) return [];

    const categorySet = new Set(budget.categoryIds || []);
    return transactions
      .filter(tx => {
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
          tx.date <= endDate
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
        const dayTxs = groups[dateStr];
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
    const dateObj = parseISO(dateStr);
    if (isToday(dateObj)) return t('common.today');
    if (isYesterday(dateObj)) return t('common.yesterday');
    return format(dateObj, 'yyyy-MM-dd');
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
    setFormCategoryIds(b.categoryIds || []);
    setIsEditDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!budget || !formName.trim() || !formAmount || parseFloat(formAmount) <= 0) return;
    const newAmountNum = parseFloat(formAmount);

    await updateBudget(budget.id, {
      name: formName.trim(),
      amount: newAmountNum,
      startDate: budget.periodType === 'custom' ? formStartDate : budget.startDate,
      endDate: budget.periodType === 'custom' ? formEndDate : budget.endDate,
      categoryIds: formCategoryIds,
    });

    setIsEditDialogOpen(false);
  };

  const handleDeleteBudget = async () => {
    if (!budget) return;
    await deleteBudget(budget.id);
    navigate('/budgets');
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
    <div className="animate-in fade-in duration-500 w-full pb-20 p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
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
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{periodInfo.title}</span>
              <span>·</span>
              <span className="font-mono">{periodInfo.dateRange}</span>
              {budget.ruleId && (
                <button
                  type="button"
                  onClick={() => navigate('/budgets?tab=rules')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title={t('budgets.tabRules')}
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>{t('budgets.ruleStrategy')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenEdit(budget)}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>{t('budgets.editBudget')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-destructive hover:border-destructive/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('budgets.deleteBudget')}</span>
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
                <span>+</span>
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
      {(monitoredCategoryList.length > 0 || periodTransactions.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('budgets.periodTransactions')} ({periodTransactions.length})
            </h3>
          </div>

          {groupedTransactions.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
              {t('budgets.noTransactionsInPeriod')}
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
                          className="w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                        >
                          <div className="flex flex-col gap-1 min-w-0 pr-4">
                            <span className="text-sm font-medium leading-none truncate">
                              {category?.name || t('common.uncategorized')}
                            </span>
                            {tx.note && (
                              <p className="text-xs text-muted-foreground truncate">
                                {tx.note}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <AmountDisplay
                              amount={tx.amount}
                              originalCurrency={tx.originalCurrency}
                              baseCurrency={activeLedger?.baseCurrency}
                              type={tx.type === 'income' ? 'income' : 'expense'}
                              className="text-base text-muted-foreground font-mono"
                            />
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
      )}

      {/* Transaction Details Dialog */}
      {selectedTransactionId && (
        <TransactionDetailsDialog
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}

      {/* Edit Budget Primary Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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

            {/* Custom Fixed Range Date Controls */}
            {budget.periodType === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('budgets.startDate')}</label>
                  <Input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('budgets.endDate')}</label>
                  <Input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                  />
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
                {t('budgets.noCategoriesMonitored')}
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
                (budget.periodType === 'custom' && (!formStartDate || !formEndDate || formStartDate > formEndDate))
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
    </div>
  );
}
