import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  ChevronDown,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  getYear,
  getQuarter,
  getWeek,
  parseISO,
} from 'date-fns';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { NoteRenderer } from '@/components/transactions/NoteRenderer';
import { cn, getCurrencySymbol } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';

type PeriodType = 'week' | 'month' | 'quarter' | 'year';

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#64748b', // slate
];

export default function Reports() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { transactions } = useTransactions();
  const { allCategories } = useCategories();
  const { wallets } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [expandedExpenseCatIds, setExpandedExpenseCatIds] = useState<Set<string>>(new Set());
  const [expandedIncomeCatIds, setExpandedIncomeCatIds] = useState<Set<string>>(new Set());
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // Calculate Start and End of period
  const { startDate, endDate, periodLabel } = useMemo(() => {
    let start: Date;
    let end: Date;
    let label = '';

    const year = getYear(currentDate);

    if (periodType === 'week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
      const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
      label = t('reports.weekFormat', { year, week: weekNum });
    } else if (periodType === 'month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
      const isZh = i18n.language.startsWith('zh');
      label = isZh ? `${year} 年 ${format(currentDate, 'M')} 月` : format(currentDate, 'MMMM yyyy');
    } else if (periodType === 'quarter') {
      start = startOfQuarter(currentDate);
      end = endOfQuarter(currentDate);
      const qNum = getQuarter(currentDate);
      label = t('reports.quarterFormat', { year, quarter: qNum });
    } else {
      start = startOfYear(currentDate);
      end = endOfYear(currentDate);
      label = i18n.language.startsWith('zh') ? `${year} 年` : `${year}`;
    }

    return { startDate: start, endDate: end, periodLabel: label };
  }, [periodType, currentDate, t, i18n.language]);

  // Navigate periods
  const handlePrev = () => {
    if (periodType === 'week') setCurrentDate(prev => addWeeks(prev, -1));
    else if (periodType === 'month') setCurrentDate(prev => addMonths(prev, -1));
    else if (periodType === 'quarter') setCurrentDate(prev => addQuarters(prev, -1));
    else setCurrentDate(prev => addYears(prev, -1));
  };

  const handleNext = () => {
    if (periodType === 'week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (periodType === 'month') setCurrentDate(prev => addMonths(prev, 1));
    else if (periodType === 'quarter') setCurrentDate(prev => addQuarters(prev, 1));
    else setCurrentDate(prev => addYears(prev, 1));
  };

  // Filter transactions in this period
  const periodTransactions = useMemo(() => {
    if (!transactions) return [];
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    return transactions.filter(tx => {
      if (tx.deleted || tx.ledgerId !== activeLedgerId) return false;
      const txDate = tx.date.split('T')[0];
      if (txDate < startStr || txDate > endStr) return false;

      // Exclude balance adjustments
      const cat = allCategories?.find(c => c.id === tx.category);
      if (cat?.isSystem) return false;

      return true;
    });
  }, [transactions, startDate, endDate, activeLedgerId, allCategories]);

  // Key Totals
  const { totalExpense, totalIncome, netBalance } = useMemo(() => {
    let exp = 0;
    let inc = 0;
    periodTransactions.forEach(tx => {
      if (tx.type === 'expense') exp += tx.amount;
      else if (tx.type === 'income') inc += tx.amount;
    });
    return {
      totalExpense: exp,
      totalIncome: inc,
      netBalance: inc - exp,
    };
  }, [periodTransactions]);

  // Category breakdown generator
  const getCategoryBreakdown = (type: 'expense' | 'income') => {
    const list = periodTransactions.filter(tx => tx.type === type);
    const total = type === 'expense' ? totalExpense : totalIncome;

    const grouped: Record<string, { categoryId: string; name: string; amount: number; transactions: Transaction[] }> = {};

    list.forEach(tx => {
      const catId = tx.category || 'unknown';
      if (!grouped[catId]) {
        const cat = allCategories?.find(c => c.id === catId);
        grouped[catId] = {
          categoryId: catId,
          name: cat?.name || t('common.unknown', '未分類'),
          amount: 0,
          transactions: [],
        };
      }
      grouped[catId].amount += tx.amount;
      grouped[catId].transactions.push(tx);
    });

    return Object.values(grouped)
      .map(item => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
        transactions: item.transactions.sort((a, b) => b.date.localeCompare(a.date)),
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const expenseBreakdown = useMemo(() => getCategoryBreakdown('expense'), [periodTransactions, totalExpense, allCategories, t]);
  const incomeBreakdown = useMemo(() => getCategoryBreakdown('income'), [periodTransactions, totalIncome, allCategories, t]);

  // Trend data generator
  const trendData = useMemo(() => {
    interface TrendBucket {
      label: string;
      expense: number;
      income: number;
    }

    const buckets: TrendBucket[] = [];

    if (periodType === 'week') {
      // 7 days
      const days = ['一', '二', '三', '四', '五', '六', '日'];
      for (let i = 0; i < 7; i++) {
        const currentDay = addWeeks(startDate, 0);
        currentDay.setDate(startDate.getDate() + i);
        const dayStr = format(currentDay, 'yyyy-MM-dd');
        let exp = 0;
        let inc = 0;
        periodTransactions.forEach(tx => {
          if (tx.date.startsWith(dayStr)) {
            if (tx.type === 'expense') exp += tx.amount;
            else if (tx.type === 'income') inc += tx.amount;
          }
        });
        const isZh = i18n.language.startsWith('zh');
        buckets.push({
          label: isZh ? `週${days[i]}` : format(currentDay, 'EEE'),
          expense: exp,
          income: inc,
        });
      }
    } else if (periodType === 'month') {
      // 4-5 week buckets in month
      const daysInMonth = endDate.getDate();
      const numBuckets = Math.ceil(daysInMonth / 7);
      for (let b = 0; b < numBuckets; b++) {
        const startDay = b * 7 + 1;
        const endDay = Math.min((b + 1) * 7, daysInMonth);
        let exp = 0;
        let inc = 0;
        periodTransactions.forEach(tx => {
          const dateObj = parseISO(tx.date);
          const dayNum = dateObj.getDate();
          if (dayNum >= startDay && dayNum <= endDay) {
            if (tx.type === 'expense') exp += tx.amount;
            else if (tx.type === 'income') inc += tx.amount;
          }
        });
        buckets.push({
          label: `${startDay}-${endDay}日`,
          expense: exp,
          income: inc,
        });
      }
    } else if (periodType === 'quarter') {
      // 3 months
      const startM = startDate.getMonth();
      for (let i = 0; i < 3; i++) {
        const m = (startM + i) % 12;
        let exp = 0;
        let inc = 0;
        periodTransactions.forEach(tx => {
          const dateObj = parseISO(tx.date);
          if (dateObj.getMonth() === m) {
            if (tx.type === 'expense') exp += tx.amount;
            else if (tx.type === 'income') inc += tx.amount;
          }
        });
        buckets.push({
          label: `${m + 1}月`,
          expense: exp,
          income: inc,
        });
      }
    } else {
      // 12 months
      for (let m = 0; m < 12; m++) {
        let exp = 0;
        let inc = 0;
        periodTransactions.forEach(tx => {
          const dateObj = parseISO(tx.date);
          if (dateObj.getMonth() === m) {
            if (tx.type === 'expense') exp += tx.amount;
            else if (tx.type === 'income') inc += tx.amount;
          }
        });
        buckets.push({
          label: `${m + 1}月`,
          expense: exp,
          income: inc,
        });
      }
    }

    const maxVal = Math.max(
      ...buckets.map(b => Math.max(b.expense, b.income)),
      1
    );

    return { buckets, maxVal };
  }, [periodTransactions, periodType, startDate, endDate, i18n.language]);

  // Helper to toggle category accordions
  const toggleExpenseCategory = (id: string) => {
    setExpandedExpenseCatIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleIncomeCategory = (id: string) => {
    setExpandedIncomeCatIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6 pb-12 max-w-4xl mx-auto">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">
          {t('reports.title')}
        </h2>
        <div className="w-8" />
      </div>

      {/* Period Selector & Navigation Bar */}
      <div className="border border-border rounded-xl p-3 bg-card flex flex-col gap-3 shadow-none">
        {/* Segmented Period Tabs */}
        <div className="flex bg-muted/60 p-1 rounded-lg border border-border">
          {(['week', 'month', 'quarter', 'year'] as PeriodType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setPeriodType(type)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer text-center",
                periodType === type
                  ? "bg-background text-foreground font-semibold shadow-none"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`reports.${type}`)}
            </button>
          ))}
        </div>

        {/* Previous / Next Navigator */}
        <div className="flex items-center justify-between px-2 pt-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrev}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
            {periodLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview Card */}
      <div className="border border-border rounded-xl overflow-hidden bg-card text-card-foreground shadow-none">
        <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5">
            {t('reports.netBalance')}
          </p>
          <p className={cn(
            "text-4xl sm:text-5xl font-mono tracking-tighter font-medium",
            netBalance === 0 ? "text-muted-foreground" : netBalance > 0 ? "text-emerald-500" : "text-destructive"
          )}>
            {netBalance > 0 ? '+' : ''}
            {currencySymbol}{netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('reports.totalExpense')}</span>
            </div>
            <p className="text-2xl font-mono tracking-tight font-medium text-foreground">
              {currencySymbol}{totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('reports.totalIncome')}</span>
            </div>
            <p className="text-2xl font-mono tracking-tight font-medium text-foreground">
              {currencySymbol}{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Multi-period Trend Chart */}
      <div className="border border-border rounded-xl p-5 bg-card text-card-foreground shadow-none space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold tracking-tight">
            {t('reports.trendTitle')}
          </h3>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/60" />
              <span className="text-muted-foreground">{t('reports.totalExpense')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-muted-foreground">{t('reports.totalIncome')}</span>
            </div>
          </div>
        </div>

        {/* SVG Column Chart */}
        <div className="w-full h-44 pt-4 flex items-end justify-between gap-1 overflow-x-auto pb-2 border-b border-border/60">
          {trendData.buckets.map((b, idx) => {
            const expHeight = trendData.maxVal > 0 ? (b.expense / trendData.maxVal) * 100 : 0;
            const incHeight = trendData.maxVal > 0 ? (b.income / trendData.maxVal) * 100 : 0;

            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end min-w-[28px] group">
                {/* Bars Container */}
                <div className="w-full flex items-end justify-center gap-1 h-32 relative">
                  {/* Expense bar */}
                  <div
                    className="w-2.5 bg-muted-foreground/40 rounded-t-sm transition-all duration-300 group-hover:bg-muted-foreground/80"
                    style={{ height: `${Math.max(expHeight, 2)}%` }}
                    title={`${t('reports.totalExpense')}: ${currencySymbol}${b.expense.toLocaleString()}`}
                  />
                  {/* Income bar */}
                  <div
                    className="w-2.5 bg-emerald-500/80 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400"
                    style={{ height: `${Math.max(incHeight, 2)}%` }}
                    title={`${t('reports.totalIncome')}: ${currencySymbol}${b.income.toLocaleString()}`}
                  />
                </div>
                {/* Bucket label */}
                <span className="text-[10px] font-mono text-muted-foreground mt-2 truncate max-w-full">
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: Expense Breakdown (並列展示之支出結構) */}
      <div className="border border-border rounded-xl bg-card text-card-foreground shadow-none overflow-hidden space-y-4 p-5">
        <div className="flex justify-between items-center border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-foreground" />
            <h3 className="text-base font-semibold tracking-tight">
              {t('reports.expenseBreakdown')}
            </h3>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {currencySymbol}{totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        {expenseBreakdown.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t('reports.noExpenses')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visual Multi-segment Progress Bar */}
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
              {expenseBreakdown.map((cat, idx) => (
                <div
                  key={cat.categoryId}
                  style={{
                    width: `${cat.percentage}%`,
                    backgroundColor: PALETTE[idx % PALETTE.length],
                  }}
                  className="h-full transition-all duration-500"
                  title={`${cat.name}: ${cat.percentage.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Category Ranking List with In-place Accordion */}
            <div className="divide-y divide-border pt-1">
              {expenseBreakdown.map((cat, idx) => {
                const isExpanded = expandedExpenseCatIds.has(cat.categoryId);
                const color = PALETTE[idx % PALETTE.length];

                return (
                  <div key={cat.categoryId} className="py-2.5">
                    {/* Category Row Trigger */}
                    <div
                      onClick={() => toggleExpenseCategory(cat.categoryId)}
                      className="flex items-center justify-between p-1 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-medium truncate text-foreground">
                          {cat.name}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          ({t('reports.transactionCount', { count: cat.transactions.length })})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground">
                          {cat.percentage.toFixed(1)}%
                        </span>
                        <span className="text-sm font-mono font-medium text-foreground">
                          {currencySymbol}{cat.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <ChevronDown className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </div>

                    {/* Progress indicator per category */}
                    <div className="w-full bg-muted/40 h-1 rounded-full overflow-hidden mt-1 px-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.percentage}%`, backgroundColor: color }}
                      />
                    </div>

                    {/* In-place Transactions List (Accordion) */}
                    {isExpanded && (
                      <div className="mt-2.5 pl-5 pr-1 space-y-1.5 border-l-2 border-border/80 ml-2 animate-in slide-in-from-top-2 duration-200">
                        {cat.transactions.map(tx => {
                          const wallet = wallets?.find(w => w.id === tx.accountId);
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() => setSelectedTransactionId(tx.id)}
                              className="w-full flex items-center justify-between py-2 px-2.5 rounded-md hover:bg-muted/40 transition-colors text-left group cursor-pointer"
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-foreground font-medium truncate">
                                      {tx.note ? <NoteRenderer note={tx.note} /> : cat.name}
                                    </span>
                                    <ReimbursementBadge transaction={tx} />
                                  </div>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {tx.date} • {wallet?.name || ''}
                                </span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground shrink-0 group-hover:text-foreground font-medium">
                                -{currencySymbol}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Income Breakdown (並列展示之收入結構) */}
      <div className="border border-border rounded-xl bg-card text-card-foreground shadow-none overflow-hidden space-y-4 p-5">
        <div className="flex justify-between items-center border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h3 className="text-base font-semibold tracking-tight">
              {t('reports.incomeBreakdown')}
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-500 font-medium">
            {currencySymbol}{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        {incomeBreakdown.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t('reports.noIncomes')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visual Multi-segment Progress Bar */}
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
              {incomeBreakdown.map((cat, idx) => (
                <div
                  key={cat.categoryId}
                  style={{
                    width: `${cat.percentage}%`,
                    backgroundColor: PALETTE[idx % PALETTE.length],
                  }}
                  className="h-full transition-all duration-500"
                  title={`${cat.name}: ${cat.percentage.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Category Ranking List with In-place Accordion */}
            <div className="divide-y divide-border pt-1">
              {incomeBreakdown.map((cat, idx) => {
                const isExpanded = expandedIncomeCatIds.has(cat.categoryId);
                const color = PALETTE[idx % PALETTE.length];

                return (
                  <div key={cat.categoryId} className="py-2.5">
                    {/* Category Row Trigger */}
                    <div
                      onClick={() => toggleIncomeCategory(cat.categoryId)}
                      className="flex items-center justify-between p-1 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-medium truncate text-foreground">
                          {cat.name}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          ({t('reports.transactionCount', { count: cat.transactions.length })})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground">
                          {cat.percentage.toFixed(1)}%
                        </span>
                        <span className="text-sm font-mono font-medium text-emerald-500">
                          +{currencySymbol}{cat.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <ChevronDown className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </div>

                    {/* Progress indicator per category */}
                    <div className="w-full bg-muted/40 h-1 rounded-full overflow-hidden mt-1 px-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${cat.percentage}%`, backgroundColor: color }}
                      />
                    </div>

                    {/* In-place Transactions List (Accordion) */}
                    {isExpanded && (
                      <div className="mt-2.5 pl-5 pr-1 space-y-1.5 border-l-2 border-border/80 ml-2 animate-in slide-in-from-top-2 duration-200">
                        {cat.transactions.map(tx => {
                          const wallet = wallets?.find(w => w.id === tx.accountId);
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() => setSelectedTransactionId(tx.id)}
                              className="w-full flex items-center justify-between py-2 px-2.5 rounded-md hover:bg-muted/40 transition-colors text-left group cursor-pointer"
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs text-foreground font-medium truncate">
                                    {tx.note ? <NoteRenderer note={tx.note} /> : cat.name}
                                  </span>
                                  <ReimbursementBadge transaction={tx} />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {tx.date} • {wallet?.name || ''}
                                </span>
                              </div>
                              <span className="text-xs font-mono text-emerald-500 shrink-0 font-medium">
                                +{currencySymbol}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Dialog */}
      <TransactionDetailsDialog
        transactionId={selectedTransactionId}
        onClose={() => setSelectedTransactionId(null)}
      />

    </div>
  );
}
