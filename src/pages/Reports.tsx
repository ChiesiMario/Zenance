import { useState, useMemo } from 'react';
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
import { useCategories } from '@/hooks/useCategories';
import { useDateRangeTransactions } from '@/hooks/useMonthTransactions';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SpringNumber } from '@/components/ui/SpringNumber';
import { MagnitudeBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { ReportTrendChart, type TrendPoint } from '@/components/reports/ReportTrendChart';
import { ReportBreakdownSection, type CategoryGroup, type CategoryBreakdownItem } from '@/components/reports/ReportBreakdownSection';
import { ReportBudgetSection } from '@/components/reports/ReportBudgetSection';
import { cn, getCurrencySymbol, formatAmountNumber } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';

export type PeriodType = 'week' | 'month' | 'quarter' | 'year';

export default function Reports() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

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
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // 計算時段開始與結束日期及標題
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

  // 前後週期導航
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

  const startStr = useMemo(() => format(startDate, 'yyyy-MM-dd'), [startDate]);
  const endStr = useMemo(() => format(endDate, 'yyyy-MM-dd'), [endDate]);
  const reportPeriodKey = useMemo(() => `${periodType}-${startStr}-${endStr}`, [periodType, startStr, endStr]);

  const { transactions: rangeTransactions } = useDateRangeTransactions(startStr, endStr);
  const { transactions: allTransactions } = useTransactions();

  // 跨期退款索引表
  const refundsByParentId = useMemo(() => {
    const map = new Map<string, number>();
    const source = allTransactions || rangeTransactions || [];
    for (const tx of source) {
      if (!tx.deleted && tx.parentId) {
        const prev = map.get(tx.parentId) || 0;
        map.set(tx.parentId, prev + tx.amount);
      }
    }
    return map;
  }, [allTransactions, rangeTransactions]);

  // 當期有效交易
  const periodTransactions = useMemo(() => {
    if (!rangeTransactions) return [];
    return rangeTransactions.filter(tx => {
      if (tx.parentId) return true;
      const cat = allCategories?.find(c => c.id === tx.category);
      if (cat?.isSystem) return false;
      return true;
    });
  }, [rangeTransactions, allCategories]);

  // 核心合計金額（扣除關聯退款）
  const { totalExpense, totalIncome, netBalance } = useMemo(() => {
    if (rangeTransactions === undefined) {
      return { totalExpense: undefined, totalIncome: undefined, netBalance: undefined };
    }
    let exp = 0;
    let inc = 0;
    periodTransactions.forEach(tx => {
      if (tx.parentId) {
        if (tx.type === 'income') exp -= tx.amount;
        else if (tx.type === 'expense') inc -= tx.amount;
        return;
      }
      if (tx.type === 'expense') exp += tx.amount;
      else if (tx.type === 'income') inc += tx.amount;
    });
    return {
      totalExpense: Math.max(0, exp),
      totalIncome: Math.max(0, inc),
      netBalance: inc - exp,
    };
  }, [periodTransactions, rangeTransactions]);

  // 週期天數與日均/月均支出
  const periodDays = useMemo(() => {
    return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }, [startDate, endDate]);

  const dailyAverage = useMemo(() => {
    if (totalExpense === undefined) return undefined;
    return totalExpense / periodDays;
  }, [totalExpense, periodDays]);

  const monthlyAverage = useMemo(() => {
    if (totalExpense === undefined) return undefined;
    return totalExpense / 12;
  }, [totalExpense]);

  const benchmarkAverage = periodType === 'year' ? monthlyAverage : dailyAverage;

  const savingsRate = useMemo(() => {
    if (totalIncome === undefined || netBalance === undefined || totalIncome <= 0) return null;
    return (netBalance / totalIncome) * 100;
  }, [netBalance, totalIncome]);

  // 單筆最高支出
  const peakExpenseItem = useMemo(() => {
    const validExpenses = periodTransactions.filter(tx => {
      if (tx.parentId || tx.type !== 'expense') return false;
      const cat = allCategories?.find(c => c.id === tx.category);
      return !cat?.isSystem;
    });

    let maxItem: { tx: Transaction; netAmount: number } | null = null;
    for (const tx of validExpenses) {
      const totalRefunded = refundsByParentId.get(tx.id) || 0;
      const netAmount = Math.max(0, tx.amount - totalRefunded);
      if (netAmount > 0 && (!maxItem || netAmount > maxItem.netAmount)) {
        maxItem = { tx, netAmount };
      }
    }
    return maxItem;
  }, [periodTransactions, allCategories, refundsByParentId]);

  // 單筆最高收入
  const peakIncomeItem = useMemo(() => {
    const validIncomes = periodTransactions.filter(tx => {
      if (tx.parentId || tx.type !== 'income') return false;
      const cat = allCategories?.find(c => c.id === tx.category);
      return !cat?.isSystem;
    });

    let maxItem: { tx: Transaction; netAmount: number } | null = null;
    for (const tx of validIncomes) {
      const totalRefunded = refundsByParentId.get(tx.id) || 0;
      const netAmount = Math.max(0, tx.amount - totalRefunded);
      if (netAmount > 0 && (!maxItem || netAmount > maxItem.netAmount)) {
        maxItem = { tx, netAmount };
      }
    }
    return maxItem;
  }, [periodTransactions, allCategories, refundsByParentId]);

  // 收支結構拆解生成器
  const getCategoryBreakdown = useMemo(() => {
    return (type: 'expense' | 'income'): CategoryGroup[] => {
      const mainList = periodTransactions.filter(tx => tx.type === type && !tx.parentId);
      const refundList = periodTransactions.filter(
        tx => tx.parentId && (type === 'expense' ? tx.type === 'income' : tx.type === 'expense')
      );
      const total = (type === 'expense' ? totalExpense : totalIncome) ?? 0;

      const grouped: Record<
        string,
        {
          categoryId: string;
          name: string;
          amount: number;
          itemMap: Map<string, CategoryBreakdownItem>;
          orphanRefunds: CategoryBreakdownItem[];
        }
      > = {};

      mainList.forEach(tx => {
        const catId = tx.category || 'unknown';
        if (!grouped[catId]) {
          const cat = allCategories?.find(c => c.id === catId);
          grouped[catId] = {
            categoryId: catId,
            name: cat?.name || t('common.unknown', '未分類'),
            amount: 0,
            itemMap: new Map(),
            orphanRefunds: [],
          };
        }
        grouped[catId].amount += tx.amount;
        grouped[catId].itemMap.set(tx.id, {
          id: tx.id,
          tx,
          netAmount: tx.amount,
          originalAmount: tx.amount,
          refundedAmount: 0,
          refundTransactions: [],
        });
      });

      // 沖抵退款
      refundList.forEach(refTx => {
        const parentTx =
          rangeTransactions?.find(t => t.id === refTx.parentId) ||
          allTransactions?.find(t => t.id === refTx.parentId);
        const targetCatId = parentTx?.category || refTx.category || 'unknown';
        if (!grouped[targetCatId]) {
          const cat = allCategories?.find(c => c.id === targetCatId);
          grouped[targetCatId] = {
            categoryId: targetCatId,
            name: cat?.name || t('common.unknown', '未分類'),
            amount: 0,
            itemMap: new Map(),
            orphanRefunds: [],
          };
        }

        grouped[targetCatId].amount = Math.max(
          0,
          Math.round((grouped[targetCatId].amount - refTx.amount) * 100) / 100
        );

        if (refTx.parentId && grouped[targetCatId].itemMap.has(refTx.parentId)) {
          const parentItem = grouped[targetCatId].itemMap.get(refTx.parentId)!;
          parentItem.refundedAmount = Math.round((parentItem.refundedAmount + refTx.amount) * 100) / 100;
          parentItem.netAmount = Math.max(
            0,
            Math.round((parentItem.originalAmount - parentItem.refundedAmount) * 100) / 100
          );
          parentItem.refundTransactions.push(refTx);
        } else {
          // 跨期退款或未匹配到當期主交易的孤立退款
          grouped[targetCatId].orphanRefunds.push({
            id: refTx.id,
            tx: refTx,
            netAmount: -refTx.amount,
            originalAmount: refTx.amount,
            refundedAmount: refTx.amount,
            refundTransactions: [refTx],
            isRefund: true,
          });
        }
      });

      return Object.values(grouped)
        .filter(item => item.amount > 0 || item.itemMap.size > 0 || item.orphanRefunds.length > 0)
        .map(item => {
          const items = [...item.itemMap.values(), ...item.orphanRefunds];
          const allTxs = items.map(i => i.tx);
          return {
            categoryId: item.categoryId,
            name: item.name,
            amount: item.amount,
            percentage: total > 0 ? Math.min(100, Math.max(0, (item.amount / total) * 100)) : 0,
            items,
            transactions: allTxs,
          };
        })
        .sort((a, b) => b.amount - a.amount);
    };
  }, [periodTransactions, rangeTransactions, allTransactions, totalExpense, totalIncome, allCategories, t]);

  const expenseBreakdown = useMemo(() => getCategoryBreakdown('expense'), [getCategoryBreakdown]);
  const incomeBreakdown = useMemo(() => getCategoryBreakdown('income'), [getCategoryBreakdown]);
  const currentBreakdown = breakdownType === 'expense' ? expenseBreakdown : incomeBreakdown;
  const currentTotal = breakdownType === 'expense' ? totalExpense : totalIncome;

  // 走勢數據產生器
  const trendPoints = useMemo((): TrendPoint[] => {
    const points: TrendPoint[] = [];

    const calculateTotals = (txList: Transaction[]) => {
      let exp = 0;
      let inc = 0;
      txList.forEach(tx => {
        if (tx.parentId) {
          if (tx.type === 'income') exp -= tx.amount;
          else if (tx.type === 'expense') inc -= tx.amount;
          return;
        }
        if (tx.type === 'expense') exp += tx.amount;
        else if (tx.type === 'income') inc += tx.amount;
      });
      return { expense: Math.max(0, exp), income: Math.max(0, inc) };
    };

    if (periodType === 'week') {
      const days = ['一', '二', '三', '四', '五', '六', '日'];
      for (let i = 0; i < 7; i++) {
        const currentDay = addWeeks(startDate, 0);
        currentDay.setDate(startDate.getDate() + i);
        const dayStr = format(currentDay, 'yyyy-MM-dd');
        const dayTxs = periodTransactions.filter(tx => tx.date.startsWith(dayStr));
        const { expense, income } = calculateTotals(dayTxs);
        const isZh = i18n.language.startsWith('zh');
        points.push({
          label: isZh ? `週${days[i]}` : format(currentDay, 'EEE'),
          fullLabel: `${format(currentDay, 'MM/dd')} (${isZh ? `週${days[i]}` : format(currentDay, 'EEE')})`,
          expense,
          income,
          dateKey: dayStr,
        });
      }
    } else if (periodType === 'month') {
      const daysInMonth = endDate.getDate();
      const isZh = i18n.language.startsWith('zh');
      for (let day = 1; day <= daysInMonth; day++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(day);
        const dayStr = format(currentDay, 'yyyy-MM-dd');
        const dayTxs = periodTransactions.filter(tx => tx.date.startsWith(dayStr));
        const { expense, income } = calculateTotals(dayTxs);
        points.push({
          label: isZh ? `${day}日` : `${day}`,
          fullLabel: format(currentDay, 'yyyy/MM/dd'),
          expense,
          income,
          dateKey: dayStr,
        });
      }
    } else if (periodType === 'quarter') {
      const startM = startDate.getMonth();
      const isZh = i18n.language.startsWith('zh');
      for (let i = 0; i < 3; i++) {
        const m = (startM + i) % 12;
        const monthTxs = periodTransactions.filter(tx => {
          const dateObj = parseISO(tx.date);
          return dateObj.getMonth() === m;
        });
        const { expense, income } = calculateTotals(monthTxs);
        points.push({
          label: isZh ? `${m + 1}月` : format(new Date(2000, m, 1), 'MMM'),
          fullLabel: isZh ? `${getYear(currentDate)} 年 ${m + 1} 月` : format(new Date(getYear(currentDate), m, 1), 'MMMM yyyy'),
          expense,
          income,
          dateKey: `${getYear(currentDate)}-${String(m + 1).padStart(2, '0')}`,
        });
      }
    } else {
      const isZh = i18n.language.startsWith('zh');
      for (let m = 0; m < 12; m++) {
        const monthTxs = periodTransactions.filter(tx => {
          const dateObj = parseISO(tx.date);
          return dateObj.getMonth() === m;
        });
        const { expense, income } = calculateTotals(monthTxs);
        points.push({
          label: isZh ? `${m + 1}月` : format(new Date(2000, m, 1), 'MMM'),
          fullLabel: isZh ? `${getYear(currentDate)} 年 ${m + 1} 月` : format(new Date(getYear(currentDate), m, 1), 'MMMM yyyy'),
          expense,
          income,
          dateKey: `${getYear(currentDate)}-${String(m + 1).padStart(2, '0')}`,
        });
      }
    }

    return points;
  }, [periodTransactions, periodType, startDate, endDate, i18n.language, currentDate]);

  return (
    <div className="w-full space-y-4 pb-12">
      {/* 頂部導航列 */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2 text-foreground">
          {t('reports.title')}
        </h2>
        <div className="w-8" />
      </div>

      {/* 週期切換與日期導航 */}
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

      {/* 1. 核心 KPI 總覽卡片 */}
      <div className="border border-border rounded-xl overflow-hidden bg-card text-card-foreground shadow-none">
        {/* 淨結餘 (Centerpiece) */}
        <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center min-w-0 overflow-hidden">
          <div className="relative flex items-center justify-center h-5 mb-1.5 w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono leading-none">
              {t('reports.netBalance')}
            </p>
            <div className="absolute right-0 flex items-center">
              <MagnitudeBadge amount={netBalance} memoryKey={`reports-net-balance-${reportPeriodKey}`} />
            </div>
          </div>
          <AutoMarquee
            align="center"
            className={cn(
              'text-4xl sm:text-5xl font-mono tracking-tighter font-semibold px-2 leading-none max-w-full',
              netBalance === undefined || netBalance === 0
                ? 'text-muted-foreground'
                : netBalance > 0
                  ? 'text-emerald-500'
                  : 'text-destructive'
            )}
          >
            {netBalance === undefined ? '' : netBalance < 0 ? '-' : netBalance > 0 ? '+' : ''}
            {currencySymbol}
            <SpringNumber
              value={netBalance !== undefined ? Math.abs(netBalance) : undefined}
              memoryKey={`reports-net-balance-${reportPeriodKey}`}
            />
          </AutoMarquee>
        </div>

        {/* 2x2 對稱指標矩陣 */}
        <div className="grid grid-cols-2 gap-px bg-border">
          {/* 指標 1: 總支出與日均 */}
          <div className="bg-card p-4 flex flex-col justify-between gap-2 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between h-5 min-w-0">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none shrink-0">
                <TrendingDown className="size-3.5 text-muted-foreground shrink-0" />
                <span>{t('reports.totalExpense')}</span>
              </span>
              <MagnitudeBadge amount={totalExpense} memoryKey={`reports-total-expense-${reportPeriodKey}`} />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none min-w-0">
                <AutoMarquee align="left">
                  <span className="whitespace-nowrap inline-flex items-center select-text">
                    {currencySymbol}
                    <SpringNumber value={totalExpense} memoryKey={`reports-total-expense-${reportPeriodKey}`} />
                  </span>
                </AutoMarquee>
              </div>
              <p
                className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate select-text"
                title={
                  dailyAverage !== undefined
                    ? `${t('reports.dailyAverage', '日均支出')}: ${currencySymbol}${dailyAverage.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                      })}`
                    : undefined
                }
              >
                {t('reports.dailyAverage', '日均支出')}: {currencySymbol}
                {dailyAverage !== undefined
                  ? dailyAverage.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 1,
                    })
                  : '--'}
              </p>
            </div>
          </div>

          {/* 指標 2: 單筆最高支出 */}
          <div
            onClick={() => {
              if (peakExpenseItem) {
                setSelectedTransactionId(peakExpenseItem.tx.id);
              }
            }}
            className={cn(
              'bg-card p-4 flex flex-col justify-between gap-2 min-w-0 overflow-hidden transition-colors',
              peakExpenseItem && 'cursor-pointer hover:bg-muted/30 group'
            )}
          >
            <div className="flex items-center justify-between h-5 min-w-0">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none shrink-0">
                <Flame className="size-3.5 text-amber-500 shrink-0" />
                <span>{t('reports.peakExpense')}</span>
              </span>
              <MagnitudeBadge
                amount={peakExpenseItem ? peakExpenseItem.netAmount : 0}
                memoryKey={`reports-peak-expense-${reportPeriodKey}`}
              />
            </div>
            <div className="min-w-0">
              {peakExpenseItem ? (
                <>
                  <div className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none min-w-0">
                    <AutoMarquee align="left">
                      <span className="whitespace-nowrap inline-flex items-center select-text">
                        {currencySymbol}
                        {formatAmountNumber(peakExpenseItem.netAmount)}
                      </span>
                    </AutoMarquee>
                  </div>
                  <div className="flex items-center justify-between mt-0.5 min-w-0">
                    <p
                      className="text-[11px] font-mono text-muted-foreground truncate select-text min-w-0 flex-1"
                      title={
                        peakExpenseItem.tx.note ||
                        allCategories?.find(c => c.id === peakExpenseItem.tx.category)?.name ||
                        t('common.unknown', '未分類')
                      }
                    >
                      {peakExpenseItem.tx.note ||
                        allCategories?.find(c => c.id === peakExpenseItem.tx.category)?.name ||
                        t('common.unknown', '未分類')}
                    </p>
                    <ChevronRight className="size-3.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl font-mono tracking-tight font-medium text-muted-foreground leading-none">
                    --
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">--</p>
                </>
              )}
            </div>
          </div>

          {/* 指標 3: 總收入與結餘率 */}
          <div className="bg-card p-4 flex flex-col justify-between gap-2 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between h-5 min-w-0">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none shrink-0">
                <TrendingUp className="size-3.5 text-emerald-500 shrink-0" />
                <span>{t('reports.totalIncome', '總收入')}</span>
              </span>
              <MagnitudeBadge amount={totalIncome} memoryKey={`reports-total-income-${reportPeriodKey}`} />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none min-w-0">
                <AutoMarquee align="left">
                  <span className="whitespace-nowrap inline-flex items-center select-text">
                    {currencySymbol}
                    <SpringNumber value={totalIncome} memoryKey={`reports-total-income-${reportPeriodKey}`} />
                  </span>
                </AutoMarquee>
              </div>
              <p
                className="text-[11px] font-mono mt-0.5 truncate select-text"
                title={savingsRate !== null ? `${t('reports.savingsRate', '結餘率')}: ${savingsRate >= 0 ? '+' : ''}${savingsRate.toFixed(1)}%` : undefined}
              >
                {savingsRate !== null ? (
                  <span
                    className={cn(
                      'font-medium',
                      savingsRate >= 0 ? 'text-emerald-500' : 'text-destructive'
                    )}
                  >
                    {t('reports.savingsRate', '結餘率')}: {savingsRate >= 0 ? '+' : ''}
                    {Math.abs(savingsRate) > 9999
                      ? (savingsRate > 0 ? '> 9999%' : '< -9999%')
                      : `${savingsRate.toFixed(1)}%`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('reports.savingsRate', '結餘率')}: --</span>
                )}
              </p>
            </div>
          </div>

          {/* 指標 4: 單筆最高收入 */}
          <div
            onClick={() => {
              if (peakIncomeItem) {
                setSelectedTransactionId(peakIncomeItem.tx.id);
              }
            }}
            className={cn(
              'bg-card p-4 flex flex-col justify-between gap-2 min-w-0 overflow-hidden transition-colors',
              peakIncomeItem && 'cursor-pointer hover:bg-muted/30 group'
            )}
          >
            <div className="flex items-center justify-between h-5 min-w-0">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none shrink-0">
                <Flame className="size-3.5 text-emerald-500 shrink-0" />
                <span>{t('reports.peakIncome')}</span>
              </span>
              <MagnitudeBadge
                amount={peakIncomeItem ? peakIncomeItem.netAmount : 0}
                memoryKey={`reports-peak-income-${reportPeriodKey}`}
              />
            </div>
            <div className="min-w-0">
              {peakIncomeItem ? (
                <>
                  <div className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none min-w-0">
                    <AutoMarquee align="left">
                      <span className="whitespace-nowrap inline-flex items-center select-text">
                        {currencySymbol}
                        {formatAmountNumber(peakIncomeItem.netAmount)}
                      </span>
                    </AutoMarquee>
                  </div>
                  <div className="flex items-center justify-between mt-0.5 min-w-0">
                    <p
                      className="text-[11px] font-mono text-muted-foreground truncate select-text min-w-0 flex-1"
                      title={
                        peakIncomeItem.tx.note ||
                        allCategories?.find(c => c.id === peakIncomeItem.tx.category)?.name ||
                        t('common.unknown', '未分類')
                      }
                    >
                      {peakIncomeItem.tx.note ||
                        allCategories?.find(c => c.id === peakIncomeItem.tx.category)?.name ||
                        t('common.unknown', '未分類')}
                    </p>
                    <ChevronRight className="size-3.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl font-mono tracking-tight font-medium text-muted-foreground leading-none">
                    --
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">--</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 全新收支走勢圖 (方案 B 一鏡到底) */}
      <ReportTrendChart
        periodType={periodType}
        points={trendPoints}
        currencySymbol={currencySymbol}
        averageValue={benchmarkAverage}
        activeBucketIdx={activeBucketIdx}
        onSelectBucket={setActiveBucketIdx}
      />

      {/* 3. 全新預算報表模組 (方案 B 一鏡到底) */}
      <ReportBudgetSection
        periodType={periodType}
        startDate={startDate}
        endDate={endDate}
        currencySymbol={currencySymbol}
      />

      {/* 4. 全新收支結構拆解 (方案 B 一鏡到底) */}
      <ReportBreakdownSection
        breakdownType={breakdownType}
        onBreakdownTypeChange={setBreakdownType}
        currentBreakdown={currentBreakdown}
        currentTotal={currentTotal}
        currencySymbol={currencySymbol}
        periodLabel={periodLabel}
        baseCurrency={baseCurrency}
        wallets={wallets}
        onSelectTransaction={setSelectedTransactionId}
      />

      {/* 交易詳情檢視彈窗 (平級 Sibling Portal 宣告) */}
      {selectedTransactionId && (
        <TransactionDetailsDialog
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}
    </div>
  );
}
