import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, getYear } from 'date-fns';
import { useBudgets } from '@/hooks/useBudgets';
import { useCategories } from '@/hooks/useCategories';
import { cn, formatAmountNumber } from '@/lib/utils';
import type { Budget } from '@/services/db/db';
import type { PeriodType } from '@/pages/Reports';

export interface ReportBudgetSectionProps {
  periodType: PeriodType;
  startDate: Date;
  endDate: Date;
  currencySymbol: string;
}

interface BudgetPerformanceItem {
  budget: Budget;
  spent: number;
  remaining: number;
  percentage: number;
  isOverbudget: boolean;
}

export function ReportBudgetSection({
  periodType,
  startDate,
  endDate,
  currencySymbol,
}: ReportBudgetSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { budgets, calculateSpent } = useBudgets();
  const { allCategories } = useCategories();

  const startStr = useMemo(() => format(startDate, 'yyyy-MM-dd'), [startDate]);
  const endStr = useMemo(() => format(endDate, 'yyyy-MM-dd'), [endDate]);
  const currentYear = useMemo(() => getYear(startDate), [startDate]);

  // 依照使用者指示嚴格篩選時段內預算
  const filteredBudgets = useMemo(() => {
    if (!budgets || budgets.length === 0) return [];

    if (periodType === 'month') {
      // 月視圖：開始和結束均在此月
      return budgets.filter(b => {
        if (!b.startDate || !b.endDate) return false;
        return b.startDate >= startStr && b.endDate <= endStr;
      });
    }

    if (periodType === 'quarter') {
      // 季度視圖：開始和結束均在此季度內
      return budgets.filter(b => {
        if (!b.startDate || !b.endDate) return false;
        return b.startDate >= startStr && b.endDate <= endStr;
      });
    }

    if (periodType === 'year') {
      // 年度視角：僅顯示年度預算
      return budgets.filter(b => {
        if (b.periodType !== 'yearly') return false;
        if (b.periodKey) {
          return b.periodKey === String(currentYear);
        }
        if (b.startDate && b.endDate) {
          return b.startDate <= endStr && b.endDate >= startStr;
        }
        return false;
      });
    }

    // 週視圖：提示並列出當前所屬月份之預算
    const mStartStr = format(startOfMonth(startDate), 'yyyy-MM-dd');
    const mEndStr = format(endOfMonth(startDate), 'yyyy-MM-dd');
    return budgets.filter(b => {
      if (!b.startDate || !b.endDate) return false;
      return b.startDate >= mStartStr && b.endDate <= mEndStr;
    });
  }, [budgets, periodType, startStr, endStr, startDate, currentYear]);

  // 計算每個預算的支出、剩餘與比例
  const budgetPerformances = useMemo((): BudgetPerformanceItem[] => {
    if (!filteredBudgets || filteredBudgets.length === 0) return [];

    return filteredBudgets.map(b => {
      const spent = calculateSpent(b, b.startDate, b.endDate);
      const remaining = b.amount - spent;
      const percentage = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      const isOverbudget = spent > b.amount;

      return {
        budget: b,
        spent,
        remaining,
        percentage,
        isOverbudget,
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }, [filteredBudgets, calculateSpent]);

  // 整體指標匯總
  const summary = useMemo(() => {
    let totalBudget = 0;
    let totalSpent = 0;
    let overbudgetCount = 0;

    budgetPerformances.forEach(item => {
      totalBudget += item.budget.amount;
      totalSpent += item.spent;
      if (item.isOverbudget) overbudgetCount += 1;
    });

    const totalCount = budgetPerformances.length;
    const onTrackCount = totalCount - overbudgetCount;
    const totalRemaining = totalBudget - totalSpent;
    const utilizationRate = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      totalBudget,
      totalSpent,
      totalRemaining,
      utilizationRate,
      overbudgetCount,
      totalCount,
      onTrackCount,
    };
  }, [budgetPerformances]);

  return (
    <div className="border border-border rounded-xl bg-card text-card-foreground shadow-none overflow-hidden space-y-4 p-5">
      {/* 區塊標頭 */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight font-mono uppercase text-foreground">
            {t('reports.budgetReportTitle', '預算執行報表')}
          </h3>
          <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
            {t('reports.budgetReportSubtitle', '監控此時段內預算額度消耗與健康度')}
          </p>
        </div>

        {summary.totalCount > 0 && (
          <div className="font-mono text-xs select-none shrink-0 font-bold">
            {summary.overbudgetCount > 0 ? (
              <>
                <span className="text-destructive">{summary.onTrackCount}</span>
                <span className="text-muted-foreground">/{summary.totalCount}</span>
              </>
            ) : (
              <span className="text-emerald-500">
                {summary.totalCount}/{summary.totalCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 週視圖溫馨提示 */}
      {periodType === 'week' && (
        <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs font-mono text-muted-foreground leading-relaxed">
          {t('reports.weekBudgetNotice', '提示：預算以月度、季度與年度為主要週期，以下為當前所屬月份之預算執行情況。')}
        </div>
      )}

      {budgetPerformances.length === 0 ? (
        /* 空狀態 */
        <div className="p-8 text-center text-sm text-muted-foreground font-mono">
          {t('reports.noBudgets', '此期間無預算。')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 總體健康度 KPI 卡片 */}
          <div className="border border-border rounded-lg bg-card overflow-hidden divide-y divide-border">
            {/* 總剩餘額度 (Centerpiece) */}
            <div className="p-4 flex flex-col items-center justify-center text-center bg-muted/10">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
                {summary.totalRemaining >= 0
                  ? t('reports.totalRemaining', '預算總剩餘')
                  : t('reports.totalOverbudget', '預算超支額')}
              </span>
              <div
                className={cn(
                  'text-3xl sm:text-4xl font-mono font-bold tracking-tight mt-1',
                  summary.totalRemaining >= 0 ? 'text-foreground' : 'text-destructive'
                )}
              >
                {summary.totalRemaining < 0 ? '-' : ''}
                {currencySymbol}
                {formatAmountNumber(Math.abs(summary.totalRemaining))}
              </div>

              {/* 整體進度條 */}
              <div className="w-full max-w-sm mt-3 space-y-1">
                <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      summary.utilizationRate > 100
                        ? 'bg-destructive'
                        : summary.utilizationRate >= 85
                          ? 'bg-amber-500'
                          : 'bg-foreground'
                    )}
                    style={{ width: `${Math.min(100, Math.max(summary.utilizationRate, 2))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
                  <span>
                    {t('reports.used', '已用')} {summary.utilizationRate.toFixed(1)}%
                  </span>
                  {summary.overbudgetCount > 0 ? (
                    <span className="text-destructive font-semibold flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      {t('reports.overbudgetWarning', { count: summary.overbudgetCount })}
                    </span>
                  ) : (
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      {t('reports.onTrack', '進度良好')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 3 指標矩陣 */}
            <div className="grid grid-cols-3 divide-x divide-border bg-card">
              <div className="p-3 text-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  {t('reports.totalBudget', '總額度')}
                </span>
                <span className="text-sm font-mono font-bold text-foreground mt-0.5 block truncate">
                  {currencySymbol}
                  {formatAmountNumber(summary.totalBudget)}
                </span>
              </div>
              <div className="p-3 text-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  {t('reports.totalSpent', '已支出')}
                </span>
                <span className="text-sm font-mono font-bold text-foreground mt-0.5 block truncate">
                  {currencySymbol}
                  {formatAmountNumber(summary.totalSpent)}
                </span>
              </div>
              <div className="p-3 text-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                  {t('reports.utilizationRate', '執行率')}
                </span>
                <span
                  className={cn(
                    'text-sm font-mono font-bold mt-0.5 block truncate',
                    summary.utilizationRate > 100
                      ? 'text-destructive'
                      : summary.utilizationRate >= 85
                        ? 'text-amber-500'
                        : 'text-foreground'
                  )}
                >
                  {summary.utilizationRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* 預算明細項目清單 (Vercel Usage List 風格) */}
          <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
            {budgetPerformances.map(item => {
              const b = item.budget;
              const hasCategories = b.categoryIds && b.categoryIds.length > 0;
              const categoryNames = hasCategories
                ? b.categoryIds!
                    .map(cid => allCategories?.find(c => c.id === cid)?.name)
                    .filter(Boolean)
                    .join('、')
                : '';

              return (
                <div
                  key={b.id}
                  onClick={() => navigate(`/budgets/${b.id}`)}
                  className="p-3.5 flex flex-col gap-2.5 hover:bg-muted/40 transition-colors cursor-pointer group select-none"
                >
                  {/* 標題行 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {b.name}
                      </span>
                      {categoryNames && (
                        <span className="text-[10px] font-mono text-muted-foreground truncate border border-border rounded px-1.5 py-0.2 bg-muted/20">
                          {categoryNames}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          'text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
                          item.isOverbudget
                            ? 'bg-destructive text-destructive-foreground'
                            : item.percentage >= 85
                              ? 'bg-amber-500 text-white'
                              : 'bg-muted text-foreground border border-border'
                        )}
                      >
                        {item.percentage.toFixed(1)}%
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </div>

                  {/* 進度槽 */}
                  <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        item.isOverbudget
                          ? 'bg-destructive'
                          : item.percentage >= 85
                            ? 'bg-amber-500'
                            : 'bg-foreground'
                      )}
                      style={{ width: `${Math.min(100, Math.max(item.percentage, 2))}%` }}
                    />
                  </div>

                  {/* 數據明細列 */}
                  <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>{t('reports.used', '已用')}:</span>
                      <span className="font-semibold text-foreground">
                        {currencySymbol}
                        {formatAmountNumber(item.spent)}
                      </span>
                      <span className="text-muted-foreground/50">/</span>
                      <span>
                        {currencySymbol}
                        {formatAmountNumber(b.amount)}
                      </span>
                    </div>

                    <div>
                      {item.isOverbudget ? (
                        <span className="text-destructive font-semibold">
                          {t('reports.overspent', '已超支')}: {currencySymbol}
                          {formatAmountNumber(Math.abs(item.remaining))}
                        </span>
                      ) : (
                        <span>
                          {t('reports.remaining', '剩餘')}: {currencySymbol}
                          {formatAmountNumber(item.remaining)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
