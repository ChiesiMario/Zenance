import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Flame,
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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { cn, getCurrencySymbol, sortTransactionsDesc } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';

type PeriodType = 'week' | 'month' | 'quarter' | 'year';

interface CategoryGroup {
  categoryId: string;
  name: string;
  amount: number;
  percentage: number;
  transactions: Transaction[];
}


function getNiceMax(val: number): number {
  if (val <= 50) return 50;
  if (val <= 100) return 100;
  if (val <= 500) return Math.ceil(val / 50) * 50;
  if (val <= 2000) return Math.ceil(val / 200) * 200;
  if (val <= 10000) return Math.ceil(val / 1000) * 1000;
  return Math.ceil(val / 5000) * 5000;
}

function getSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

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
  const [breakdownType, setBreakdownType] = useState<'expense' | 'income'>('expense');
  const [activeBucketIdx, setActiveBucketIdx] = useState<number | null>(null);

  // Drilldown Modal states
  const [inspectCategory, setInspectCategory] = useState<CategoryGroup | null>(null);
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
    setActiveBucketIdx(null);
  };

  const handleNext = () => {
    if (periodType === 'week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (periodType === 'month') setCurrentDate(prev => addMonths(prev, 1));
    else if (periodType === 'quarter') setCurrentDate(prev => addQuarters(prev, 1));
    else setCurrentDate(prev => addYears(prev, 1));
    setActiveBucketIdx(null);
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

  // Calculate Period Days and Daily Average
  const periodDays = useMemo(() => {
    const diff = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return diff;
  }, [startDate, endDate]);

  const dailyAverage = useMemo(() => {
    return totalExpense / periodDays;
  }, [totalExpense, periodDays]);

  const savingsRate = useMemo(() => {
    if (totalIncome <= 0) return null;
    return (netBalance / totalIncome) * 100;
  }, [netBalance, totalIncome]);

  // Single peak expense transaction
  const peakExpenseTx = useMemo(() => {
    const expenseList = periodTransactions.filter(tx => tx.type === 'expense');
    if (expenseList.length === 0) return null;
    return expenseList.reduce((max, tx) => (tx.amount > max.amount ? tx : max), expenseList[0]);
  }, [periodTransactions]);

  // Category breakdown generator
  const getCategoryBreakdown = useMemo(() => {
    return (type: 'expense' | 'income'): CategoryGroup[] => {
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
          transactions: sortTransactionsDesc(item.transactions),
        }))
        .sort((a, b) => b.amount - a.amount);
    };
  }, [periodTransactions, totalExpense, totalIncome, allCategories, t]);

  const expenseBreakdown = useMemo(() => getCategoryBreakdown('expense'), [getCategoryBreakdown]);
  const incomeBreakdown = useMemo(() => getCategoryBreakdown('income'), [getCategoryBreakdown]);
  const currentBreakdown = breakdownType === 'expense' ? expenseBreakdown : incomeBreakdown;
  const currentTotal = breakdownType === 'expense' ? totalExpense : totalIncome;

  // Trend data generator
  const trendData = useMemo(() => {
    interface TrendPoint {
      label: string;
      fullLabel: string;
      expense: number;
      income: number;
      dateKey: string;
    }

    const points: TrendPoint[] = [];

    if (periodType === 'week') {
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
        points.push({
          label: isZh ? `週${days[i]}` : format(currentDay, 'EEE'),
          fullLabel: `${format(currentDay, 'MM/dd')} (${isZh ? `週${days[i]}` : format(currentDay, 'EEE')})`,
          expense: exp,
          income: inc,
          dateKey: dayStr,
        });
      }
    } else if (periodType === 'month') {
      const daysInMonth = endDate.getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(day);
        const dayStr = format(currentDay, 'yyyy-MM-dd');
        let exp = 0;
        let inc = 0;
        periodTransactions.forEach(tx => {
          if (tx.date.startsWith(dayStr)) {
            if (tx.type === 'expense') exp += tx.amount;
            else if (tx.type === 'income') inc += tx.amount;
          }
        });
        points.push({
          label: `${day}日`,
          fullLabel: `${format(currentDay, 'yyyy/MM/dd')}`,
          expense: exp,
          income: inc,
          dateKey: dayStr,
        });
      }
    } else if (periodType === 'quarter') {
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
        points.push({
          label: `${m + 1}月`,
          fullLabel: `${getYear(currentDate)} 年 ${m + 1} 月`,
          expense: exp,
          income: inc,
          dateKey: `${getYear(currentDate)}-${String(m + 1).padStart(2, '0')}`,
        });
      }
    } else {
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
        points.push({
          label: `${m + 1}月`,
          fullLabel: `${getYear(currentDate)} 年 ${m + 1} 月`,
          expense: exp,
          income: inc,
          dateKey: `${getYear(currentDate)}-${String(m + 1).padStart(2, '0')}`,
        });
      }
    }

    const rawMax = Math.max(
      ...points.map(p => Math.max(p.expense, p.income)),
      0
    );
    const niceMax = getNiceMax(rawMax);

    const svgWidth = 1000;
    const svgHeight = 240;
    const plotTop = 20;
    const plotBottom = 215;
    const plotHeight = plotBottom - plotTop;

    const n = points.length;
    const expensePts = points.map((p, i) => {
      const x = n > 1 ? (i / (n - 1)) * svgWidth : svgWidth / 2;
      const y = plotBottom - (niceMax > 0 ? (p.expense / niceMax) * plotHeight : 0);
      return { x, y };
    });

    const incomePts = points.map((p, i) => {
      const x = n > 1 ? (i / (n - 1)) * svgWidth : svgWidth / 2;
      const y = plotBottom - (niceMax > 0 ? (p.income / niceMax) * plotHeight : 0);
      return { x, y };
    });

    const expensePath = getSmoothPath(expensePts);
    const incomePath = getSmoothPath(incomePts);

    const expenseArea = n > 1 && expensePath ? `${expensePath} L ${svgWidth} ${plotBottom} L 0 ${plotBottom} Z` : '';
    const incomeArea = n > 1 && incomePath ? `${incomePath} L ${svgWidth} ${plotBottom} L 0 ${plotBottom} Z` : '';

    return {
      points,
      rawMax,
      niceMax,
      expensePts,
      incomePts,
      expensePath,
      incomePath,
      expenseArea,
      incomeArea,
      plotBottom,
      svgWidth,
      svgHeight,
    };
  }, [periodTransactions, periodType, startDate, endDate, i18n.language, currentDate]);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (clientX: number) => {
    if (!chartContainerRef.current || trendData.points.length === 0) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = rect.width > 0 ? x / rect.width : 0;
    const n = trendData.points.length;
    const idx = Math.min(n - 1, Math.max(0, Math.round(pct * (n - 1))));
    setActiveBucketIdx(idx);
  };

  const xTicks = useMemo(() => {
    const n = trendData.points.length;
    if (n <= 1) return trendData.points.map((p, i) => ({ label: p.label, idx: i }));
    if (n <= 7) return trendData.points.map((p, i) => ({ label: p.label, idx: i }));
    const step = (n - 1) / 4;
    const indices = [0, Math.round(step), Math.round(step * 2), Math.round(step * 3), n - 1];
    const uniqueIndices = Array.from(new Set(indices));
    return uniqueIndices.map(idx => ({ label: trendData.points[idx].label, idx }));
  }, [trendData.points]);

  const activePoint = activeBucketIdx !== null && activeBucketIdx < trendData.points.length
    ? trendData.points[activeBucketIdx]
    : null;

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
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
        <SegmentedControl<PeriodType>
          value={periodType}
          onChange={val => {
            setPeriodType(val);
            setActiveBucketIdx(null);
          }}
          fullWidth
          options={[
            { value: 'week', label: t('reports.week') },
            { value: 'month', label: t('reports.month') },
            { value: 'quarter', label: t('reports.quarter') },
            { value: 'year', label: t('reports.year') },
          ]}
        />

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

      {/* Primary KPI Overview Card (Vercel Metrics Style) */}
      <div className="border border-border rounded-xl overflow-hidden bg-card text-card-foreground shadow-none">
        {/* Net Balance Centerpiece */}
        <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 font-mono">
            {t('reports.netBalance')}
          </p>
          <p
            className={cn(
              'text-4xl sm:text-5xl font-mono tracking-tighter font-semibold',
              netBalance === 0
                ? 'text-muted-foreground'
                : netBalance > 0
                  ? 'text-emerald-500'
                  : 'text-destructive'
            )}
          >
            {netBalance < 0 ? '-' : netBalance > 0 ? '+' : ''}
            {currencySymbol}
            {Math.abs(netBalance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        {/* 3-Column Analytical Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border bg-card">
          {/* Indicator 1: Total Expense & Daily Avg */}
          <div className="p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5">
                <TrendingDown className="size-3.5 text-muted-foreground" />
                <span>{t('reports.totalExpense')}</span>
              </span>
            </div>
            <div>
              <p className="text-xl font-mono tracking-tight font-medium text-foreground">
                {currencySymbol}
                {totalExpense.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {t('reports.dailyAverage', '日均支出')}: {currencySymbol}
                {dailyAverage.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1,
                })}
              </p>
            </div>
          </div>

          {/* Indicator 2: Total Income & Savings Rate */}
          <div className="p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-emerald-500" />
                <span>{t('reports.totalIncome', '總收入')}</span>
              </span>
            </div>
            <div>
              <p className="text-xl font-mono tracking-tight font-medium text-foreground">
                {currencySymbol}
                {totalIncome.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-[11px] font-mono mt-0.5">
                {savingsRate !== null ? (
                  <span
                    className={cn(
                      'font-medium',
                      savingsRate >= 0 ? 'text-emerald-500' : 'text-destructive'
                    )}
                  >
                    {t('reports.savingsRate', '結餘率')}: {savingsRate >= 0 ? '+' : ''}
                    {savingsRate.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('reports.savingsRate', '結餘率')}: --</span>
                )}
              </p>
            </div>
          </div>

          {/* Indicator 3: Peak Single Expense */}
          <div className="p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5">
                <Flame className="size-3.5 text-amber-500" />
                <span>{t('reports.peakExpense', '單筆最高')}</span>
              </span>
            </div>
            <div>
              {peakExpenseTx ? (
                <>
                  <p className="text-xl font-mono tracking-tight font-medium text-foreground truncate">
                    {currencySymbol}
                    {peakExpenseTx.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                    {peakExpenseTx.note ||
                      allCategories?.find(c => c.id === peakExpenseTx.category)?.name ||
                      t('common.unknown', '未分類')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-mono tracking-tight font-medium text-muted-foreground">
                    --
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">--</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trend Section (Proposal 1: Immersive Smooth Dual-Curve Area Scrubber) */}
      <div className="border border-border rounded-xl p-5 bg-card text-card-foreground shadow-none space-y-4">
        {/* Card Header & Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight font-mono uppercase text-foreground">
              {t('reports.trendTitle', '收支走勢')}
            </h3>
            <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
              {t('reports.hoverHint', '滑動或點擊圖表檢視每日明細')}
            </p>
          </div>

          {/* Clean Legend */}
          <div className="flex items-center gap-4 text-xs font-mono shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-sm bg-foreground" />
              <span className="text-muted-foreground">{t('reports.expenseTrend', '支出走勢')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-emerald-500" />
              <span className="text-muted-foreground">{t('reports.incomeTrend', '收入走勢')}</span>
            </div>
          </div>
        </div>

        {/* Live Inspector Bar */}
        {(() => {
          const inspectedPoint = activePoint || (trendData.points.length > 0 ? trendData.points[trendData.points.length - 1] : null);
          const expVal = inspectedPoint ? inspectedPoint.expense : 0;
          const incVal = inspectedPoint ? inspectedPoint.income : 0;
          const netVal = incVal - expVal;

          return (
            <div className="bg-muted/20 border border-border/60 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 font-mono">
              <div className="text-xs">
                <span className="text-muted-foreground">{t('reports.selectedPoint', '選定時點')}：</span>
                <span className="font-bold text-foreground">
                  {inspectedPoint ? inspectedPoint.fullLabel : '--'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{t('reports.expense', '支出')}：</span>
                  <span className="font-bold text-foreground">
                    {currencySymbol}
                    {expVal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('reports.income', '收入')}：</span>
                  <span className="font-bold text-emerald-500">
                    {currencySymbol}
                    {incVal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('reports.netBalance', '結餘')}：</span>
                  <span
                    className={cn(
                      'font-bold',
                      netVal > 0
                        ? 'text-emerald-500'
                        : netVal < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    )}
                  >
                    {netVal < 0 ? '-' : netVal > 0 ? '+' : ''}
                    {currencySymbol}
                    {Math.abs(netVal).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Big Expanded Canvas (Height = 256px ~ 288px) */}
        <div
          ref={chartContainerRef}
          className="relative w-full h-64 sm:h-72 border border-border/40 rounded-lg bg-card/40 overflow-hidden cursor-crosshair select-none touch-none"
          onPointerDown={e => {
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            handlePointerMove(e.clientX);
          }}
          onPointerMove={e => {
            if (e.buttons > 0 || e.pointerType === 'mouse') {
              handlePointerMove(e.clientX);
            }
          }}
          onPointerUp={e => {
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onMouseLeave={() => setActiveBucketIdx(null)}
        >
          {/* Background Gridlines with Absolute Value Ticks */}
          <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none text-[10px] font-mono text-muted-foreground/60 z-0">
            <div className="flex items-center justify-between border-b border-border/40 border-dashed pb-0.5">
              <span>
                {currencySymbol}
                {trendData.niceMax.toLocaleString()}
              </span>
              <span className="text-[9px] uppercase tracking-wider">{t('reports.peakScale', '最高峰 Peak')}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/30 border-dashed pb-0.5">
              <span>
                {currencySymbol}
                {(trendData.niceMax / 2).toLocaleString()}
              </span>
              <span className="text-[9px] uppercase tracking-wider">{t('reports.midScale', '中位基準')}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-0.5">
              <span>{currencySymbol}0</span>
              <span className="text-[9px] uppercase tracking-wider">{t('reports.baseScale', '基線 Base')}</span>
            </div>
          </div>

          {/* Empty State Banner if no transactions */}
          {periodTransactions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <span className="text-xs font-mono text-muted-foreground/70 bg-card/90 px-3 py-1.5 rounded-full border border-border/60">
                {t('reports.noTransactions', '此期間尚無任何交易紀錄')}
              </span>
            </div>
          )}

          {/* SVG Smooth Area Paths */}
          <svg
            className="absolute inset-0 w-full h-full p-4 pointer-events-none z-10 overflow-visible"
            viewBox={`0 0 ${trendData.svgWidth} ${trendData.svgHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="reports-expense-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" className="text-foreground" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" className="text-foreground" />
              </linearGradient>
              <linearGradient id="reports-income-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Income Area Fill */}
            {trendData.incomeArea && (
              <path d={trendData.incomeArea} fill="url(#reports-income-grad)" />
            )}

            {/* Income Line Stroke (Emerald Dashed) */}
            {trendData.incomePath && (
              <path
                d={trendData.incomePath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}

            {/* Expense Area Fill */}
            {trendData.expenseArea && (
              <path d={trendData.expenseArea} fill="url(#reports-expense-grad)" />
            )}

            {/* Expense Line Stroke (Foreground Solid) */}
            {trendData.expensePath && (
              <path
                d={trendData.expensePath}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-foreground"
              />
            )}

            {/* Scrubber Crosshair Indicator Line & Dots */}
            {activeBucketIdx !== null && trendData.expensePts[activeBucketIdx] && (
              <g>
                {/* Vertical Scrubber Line */}
                <line
                  x1={trendData.expensePts[activeBucketIdx].x}
                  y1={0}
                  x2={trendData.expensePts[activeBucketIdx].x}
                  y2={trendData.plotBottom}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  className="text-foreground/50"
                />
                {/* Expense Node Dot */}
                {trendData.points[activeBucketIdx]?.expense > 0 && (
                  <circle
                    cx={trendData.expensePts[activeBucketIdx].x}
                    cy={trendData.expensePts[activeBucketIdx].y}
                    r={5}
                    className="fill-foreground stroke-background stroke-2"
                  />
                )}
                {/* Income Node Dot */}
                {trendData.points[activeBucketIdx]?.income > 0 && (
                  <circle
                    cx={trendData.incomePts[activeBucketIdx].x}
                    cy={trendData.incomePts[activeBucketIdx].y}
                    r={5}
                    className="fill-emerald-500 stroke-background stroke-2"
                  />
                )}
              </g>
            )}
          </svg>

          {/* Interactive Vertical Scrubber Floating Date Badge */}
          {activeBucketIdx !== null && trendData.points[activeBucketIdx] && (
            <div
              className="absolute top-2 -translate-x-1/2 bg-foreground text-background text-[10px] font-mono px-2 py-0.5 rounded font-semibold pointer-events-none z-20 shadow-none"
              style={{
                left: `${
                  trendData.points.length > 1
                    ? (activeBucketIdx / (trendData.points.length - 1)) * 100
                    : 50
                }%`,
              }}
            >
              {trendData.points[activeBucketIdx].label}
            </div>
          )}
        </div>

        {/* Bottom Timeline Axis */}
        <div className="relative w-full h-4 text-[10px] font-mono text-muted-foreground px-4">
          {xTicks.map(tick => {
            const leftPct =
              trendData.points.length > 1
                ? (tick.idx / (trendData.points.length - 1)) * 100
                : 50;
            return (
              <span
                key={tick.idx}
                className={cn(
                  'absolute -translate-x-1/2 transition-colors select-none',
                  activeBucketIdx === tick.idx ? 'text-foreground font-bold' : 'text-muted-foreground'
                )}
                style={{ left: `${leftPct}%` }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Composition Breakdown (Monochrome Stack & Clean Hierarchy) */}
      <div className="border border-border rounded-xl bg-card text-card-foreground shadow-none overflow-hidden space-y-4 p-5">
        {/* Header & Segmented Dimension Switcher */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight font-mono uppercase text-foreground">
              {breakdownType === 'expense'
                ? t('reports.expenseBreakdown', '支出結構拆解')
                : t('reports.incomeBreakdown', '收入結構拆解')}
            </h3>
            <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
              {t('reports.breakdownSubtitle', {
                count: currentBreakdown.reduce((sum, c) => sum + c.transactions.length, 0),
              })}
            </p>
          </div>

          <SegmentedControl<'expense' | 'income'>
            value={breakdownType}
            onChange={val => setBreakdownType(val)}
            options={[
              { value: 'expense', label: t('reports.expense', '支出') },
              { value: 'income', label: t('reports.income', '收入') },
            ]}
          />
        </div>

        {currentBreakdown.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground font-mono">
            {breakdownType === 'expense'
              ? t('reports.noExpenses', '此期間無任何支出紀錄')
              : t('reports.noIncomes', '此期間無任何收入紀錄')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chunky Treemap Stack Bar (Height = 28px) */}
            <div className="space-y-1.5">
              {/* Top-Right Total Amount above Progress Bar */}
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {breakdownType === 'expense'
                    ? t('reports.expense', '支出')
                    : t('reports.income', '收入')} · 100%
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('reports.total', '合計')}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {currencySymbol}
                    {currentTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="w-full h-7 rounded-lg bg-muted/40 overflow-hidden flex gap-0.5 p-0.5 border border-border">
                {currentBreakdown.map((cat, idx) => {
                  const isTop = idx === 0;
                  return (
                    <div
                      key={cat.categoryId}
                      onClick={() => setInspectCategory(cat)}
                      style={{ width: `${cat.percentage}%` }}
                      className={cn(
                        'h-full rounded-sm transition-all cursor-pointer flex items-center justify-between px-2 font-mono text-[10px] font-bold select-none min-w-[8px]',
                        breakdownType === 'expense'
                          ? isTop
                            ? 'bg-foreground text-background'
                            : idx === 1
                              ? 'bg-zinc-600 text-white'
                              : idx === 2
                                ? 'bg-zinc-500 text-white'
                                : idx === 3
                                  ? 'bg-zinc-400 text-black'
                                  : 'bg-zinc-300 text-black'
                          : isTop
                            ? 'bg-emerald-500 text-white'
                            : idx === 1
                              ? 'bg-emerald-600 text-white'
                              : idx === 2
                                ? 'bg-emerald-700 text-white'
                                : 'bg-emerald-800 text-white'
                      )}
                      title={`${cat.name}: ${cat.percentage.toFixed(1)}% (${currencySymbol}${cat.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
                    >
                      {cat.percentage >= 14 && (
                        <span className="truncate mr-1">{cat.name}</span>
                      )}
                      {cat.percentage >= 9 && (
                        <span className="shrink-0 ml-auto">{cat.percentage.toFixed(1)}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60 px-1 select-none">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* 2-Column Split Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {currentBreakdown.map((cat, idx) => {
                const isTop = idx === 0;
                return (
                  <div
                    key={cat.categoryId}
                    onClick={() => setInspectCategory(cat)}
                    className="border border-border rounded-xl p-4 bg-card hover:border-foreground/40 transition-colors cursor-pointer space-y-3 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'size-2.5 rounded-full shrink-0',
                            breakdownType === 'expense'
                              ? isTop
                                ? 'bg-foreground'
                                : idx === 1
                                  ? 'bg-zinc-600'
                                  : idx === 2
                                    ? 'bg-zinc-500'
                                    : 'bg-zinc-400'
                              : isTop
                                ? 'bg-emerald-500'
                                : idx === 1
                                  ? 'bg-emerald-600'
                                  : 'bg-emerald-700'
                          )}
                        />
                        <span className="font-semibold text-sm truncate text-foreground group-hover:underline underline-offset-4">
                          {cat.name}
                        </span>
                      </div>

                      <span
                        className={cn(
                          'text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0',
                          isTop
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-foreground border border-border'
                        )}
                      >
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                        {currencySymbol}
                        {cat.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {t('reports.transactionCount', { count: cat.transactions.length })}
                      </span>
                    </div>

                    {/* Progress Mini Bar */}
                    <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          breakdownType === 'expense'
                            ? isTop
                              ? 'bg-foreground'
                              : idx === 1
                                ? 'bg-zinc-600'
                                : idx === 2
                                  ? 'bg-zinc-500'
                                  : 'bg-zinc-400'
                            : isTop
                              ? 'bg-emerald-500'
                              : idx === 1
                                ? 'bg-emerald-600'
                                : 'bg-emerald-700'
                        )}
                        style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Category Transactions Drilldown Dialog */}
      <Dialog open={!!inspectCategory} onOpenChange={open => !open && setInspectCategory(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-5">
          <DialogHeader className="pr-10">
            <DialogTitle className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="truncate">{inspectCategory?.name}</span>
              <span className="text-sm font-mono font-bold text-foreground shrink-0">
                {currencySymbol}
                {inspectCategory?.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-muted-foreground">
              {periodLabel} •{' '}
              {t('reports.transactionCount', {
                count: inspectCategory?.transactions.length || 0,
              })}{' '}
              • {t('reports.percentage')}: {inspectCategory?.percentage.toFixed(1)}%
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-border -mx-5 px-5 pt-2">
            {inspectCategory?.transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                {t('reports.noTransactions')}
              </div>
            ) : (
              inspectCategory?.transactions.map(tx => {
                const wallet = wallets?.find(w => w.id === tx.accountId);
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedTransactionId(tx.id)}
                    className="w-full flex items-center justify-between py-2.5 hover:bg-muted/40 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-foreground font-medium truncate">
                          {tx.note || inspectCategory.name}
                        </span>
                        <ReimbursementBadge transaction={tx} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {tx.date} • {wallet?.name || ''}
                      </span>
                    </div>

                    <AmountDisplay
                      amount={tx.amount}
                      originalCurrency={tx.originalCurrency}
                      baseCurrency={baseCurrency}
                      type={breakdownType === 'expense' ? 'expense' : 'income'}
                      className="text-xs font-mono font-medium shrink-0"
                    />
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Details Inspector Modal */}
      {selectedTransactionId && (
        <TransactionDetailsDialog
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}
    </div>
  );
}
