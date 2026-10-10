import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ArrowDown, ArrowUp } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { cn, formatAmountNumber } from '@/lib/utils';
import type { Transaction, Account } from '@/services/db/db';

export interface CategoryBreakdownItem {
  id: string;
  tx: Transaction;
  netAmount: number;
  originalAmount: number;
  refundedAmount: number;
  refundTransactions: Transaction[];
  isRefund?: boolean;
}

export interface CategoryGroup {
  categoryId: string;
  name: string;
  amount: number;
  percentage: number;
  items: CategoryBreakdownItem[];
  transactions: Transaction[];
}

export interface ReportBreakdownSectionProps {
  breakdownType: 'expense' | 'income';
  onBreakdownTypeChange: (type: 'expense' | 'income') => void;
  currentBreakdown: CategoryGroup[];
  currentTotal?: number;
  currencySymbol: string;
  periodLabel: string;
  baseCurrency: string;
  wallets?: Account[];
  onSelectTransaction: (txId: string) => void;
}

export function ReportBreakdownSection({
  breakdownType,
  onBreakdownTypeChange,
  currentBreakdown,
  currentTotal,
  currencySymbol,
  periodLabel,
  baseCurrency,
  wallets,
  onSelectTransaction,
}: ReportBreakdownSectionProps) {
  const { t } = useTranslation();
  const [inspectCategory, setInspectCategory] = useState<CategoryGroup | null>(null);
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const totalTxCount = useMemo(() => {
    return currentBreakdown.reduce((sum, c) => sum + (c.items?.length ?? c.transactions?.length ?? 0), 0);
  }, [currentBreakdown]);

  const sortedItems = useMemo(() => {
    if (!inspectCategory) return [];
    const list = inspectCategory.items ? [...inspectCategory.items] : [];
    return list.sort((a, b) => {
      if (sortField === 'date') {
        const diff = new Date(b.tx.date).getTime() - new Date(a.tx.date).getTime();
        return sortOrder === 'desc' ? diff : -diff;
      } else {
        const diff = b.netAmount - a.netAmount;
        return sortOrder === 'desc' ? diff : -diff;
      }
    });
  }, [inspectCategory, sortField, sortOrder]);

  return (
    <div className="border border-border rounded-xl bg-card text-card-foreground shadow-none overflow-hidden space-y-4 p-5">
      {/* 標題與維度切換 (SegmentedControl) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight font-mono uppercase text-foreground">
            {breakdownType === 'expense'
              ? t('reports.expenseBreakdown', '支出結構拆解')
              : t('reports.incomeBreakdown', '收入結構拆解')}
          </h3>
          <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
            {t('reports.breakdownSubtitle', { count: totalTxCount })}
          </p>
        </div>

        <SegmentedControl<'expense' | 'income'>
          value={breakdownType}
          onChange={onBreakdownTypeChange}
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
          {/* 全寬整合式佔比槽 (Proportional Stack Bar) */}
          <div className="space-y-1.5">
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
                  {currentTotal !== undefined ? formatAmountNumber(currentTotal) : '--'}
                </span>
              </div>
            </div>

            <div className="w-full h-7 rounded-lg bg-muted/30 overflow-hidden flex gap-0.5 p-0.5 border border-border select-none">
              {currentBreakdown.map((cat, idx) => {
                const isTop = idx === 0;
                return (
                  <div
                    key={cat.categoryId}
                    onClick={() => setInspectCategory(cat)}
                    style={{ width: `${cat.percentage}%` }}
                    className={cn(
                      'h-full rounded-sm transition-all cursor-pointer flex items-center justify-between px-2 font-mono text-[10px] font-bold min-w-[6px]',
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
                    title={`${cat.name}: ${cat.percentage.toFixed(1)}% (${currencySymbol}${formatAmountNumber(cat.amount)})`}
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
          </div>

          {/* 表格式排行榜清單 (Vercel Usage List 佈局) */}
          <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
            {currentBreakdown.map((cat, idx) => {
              const isTop = idx === 0;
              const rankStr = `#${String(idx + 1).padStart(2, '0')}`;

              return (
                <div
                  key={cat.categoryId}
                  onClick={() => setInspectCategory(cat)}
                  className="p-3.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] items-center gap-3 sm:gap-6 hover:bg-muted/40 transition-colors cursor-pointer group select-none"
                >
                  {/* 左側：排名、色彩點、名稱、交易筆數 */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <span className="text-[11px] font-mono text-muted-foreground/60 w-5 shrink-0 font-semibold">
                      {rankStr}
                    </span>
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
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
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {cat.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {t('reports.transactionCount', { count: cat.transactions.length })}
                      </span>
                    </div>
                  </div>

                  {/* 中間：進度條 (在 sm 螢幕以上顯示，100% 絕對幾何正中心，左右空間由 minmax(0,1fr) 嚴格均分) */}
                  <div className="hidden sm:block w-full">
                    <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          breakdownType === 'expense'
                            ? isTop
                              ? 'bg-foreground'
                              : 'bg-zinc-500'
                            : isTop
                              ? 'bg-emerald-500'
                              : 'bg-emerald-600'
                        )}
                        style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                      />
                    </div>
                  </div>

                  {/* 右側：金額、佔比、跳轉箭頭 (支援超長金額自動跑馬燈，絕不撐爆或反向壓縮) */}
                  <div className="flex items-center gap-2 sm:gap-3 text-right justify-self-end w-full min-w-0 justify-end">
                    <div className="flex flex-col items-end min-w-0 flex-1">
                      <div className="text-sm font-mono font-bold text-foreground w-full flex justify-end min-w-0 overflow-hidden">
                        <AutoMarquee align="right">
                          <span className="whitespace-nowrap select-text">
                            {currencySymbol}
                            {formatAmountNumber(cat.amount)}
                          </span>
                        </AutoMarquee>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground font-semibold shrink-0">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 分類明細鑽取彈窗 (平級 Sibling Portal 宣告) */}
      <Dialog open={!!inspectCategory} onOpenChange={open => !open && setInspectCategory(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-5 z-[60]">
          <DialogHeader className="pr-10">
            <DialogTitle className="truncate">
              {inspectCategory?.name}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-muted-foreground">
              {periodLabel} •{' '}
              {t('reports.transactionCount', {
                count: inspectCategory?.items?.length ?? inspectCategory?.transactions?.length ?? 0,
              })}{' '}
              • {t('reports.percentage')}: {inspectCategory?.percentage.toFixed(1)}%
            </DialogDescription>
          </DialogHeader>

          {/* 排序與統計工具列 Bar */}
          <div className="flex items-center justify-between py-2 border-b border-border/60 text-xs font-mono select-none">
            {/* 左側排序按鈕：時間、金額 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (sortField === 'date') {
                    setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                  } else {
                    setSortField('date');
                    setSortOrder('desc');
                  }
                }}
                className={cn(
                  'h-6 px-2 rounded text-[11px] font-mono inline-flex items-center gap-1 border transition-colors cursor-pointer',
                  sortField === 'date'
                    ? 'bg-foreground text-background border-foreground font-semibold'
                    : 'bg-muted/30 text-muted-foreground border-border/80 hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <span>{t('reports.sortByDate', '時間')}</span>
                {sortField === 'date' && (
                  sortOrder === 'desc' ? (
                    <ArrowDown className="size-2.5" />
                  ) : (
                    <ArrowUp className="size-2.5" />
                  )
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (sortField === 'amount') {
                    setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                  } else {
                    setSortField('amount');
                    setSortOrder('desc');
                  }
                }}
                className={cn(
                  'h-6 px-2 rounded text-[11px] font-mono inline-flex items-center gap-1 border transition-colors cursor-pointer',
                  sortField === 'amount'
                    ? 'bg-foreground text-background border-foreground font-semibold'
                    : 'bg-muted/30 text-muted-foreground border-border/80 hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <span>{t('reports.sortByAmount', '金額')}</span>
                {sortField === 'amount' && (
                  sortOrder === 'desc' ? (
                    <ArrowDown className="size-2.5" />
                  ) : (
                    <ArrowUp className="size-2.5" />
                  )
                )}
              </button>
            </div>

            {/* 右側總金額統計 */}
            <div className="text-right font-mono text-xs">
              <span className="text-muted-foreground mr-1.5 text-[11px]">{t('reports.total', '合計')}</span>
              <span className="font-bold text-foreground">
                {currencySymbol}
                {inspectCategory ? formatAmountNumber(inspectCategory.amount) : '0'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border -mx-5 px-5 pt-1">
            {sortedItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                {t('reports.noTransactions')}
              </div>
            ) : (
              sortedItems.map(item => {
                const { tx, netAmount, refundedAmount, isRefund } = item;
                const wallet = wallets?.find(w => w.id === tx.accountId);
                const isPartiallyRefunded = refundedAmount > 0 && netAmount > 0.001;
                const isFullyRefunded = refundedAmount > 0 && netAmount <= 0.001;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInspectCategory(null);
                      onSelectTransaction(tx.id);
                    }}
                    className="w-full flex items-center justify-between py-2.5 hover:bg-muted/40 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-foreground font-medium truncate select-text">
                          {tx.note || inspectCategory?.name || ''}
                        </span>
                        {isFullyRefunded && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded border border-border bg-muted/40 text-muted-foreground font-mono shrink-0">
                            {t('refund.refunded', '已退款')}
                          </span>
                        )}
                        {isPartiallyRefunded && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded border border-border bg-muted/40 text-muted-foreground font-mono shrink-0">
                            {t('refund.partiallyRefunded', '部分退款')}
                          </span>
                        )}
                        {isRefund && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded border border-border bg-muted/40 text-muted-foreground font-mono shrink-0">
                            {t('reports.refundTag', '退款')}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] font-mono text-muted-foreground">
                        {tx.date} • {wallet?.name || ''}
                        {refundedAmount > 0 && !isRefund && (
                          <span className="ml-1 opacity-80">
                            • {t('reports.refundedAmount', '已退')} {currencySymbol}{formatAmountNumber(refundedAmount)}
                          </span>
                        )}
                      </span>
                    </div>

                    <AmountDisplay
                      amount={Math.abs(netAmount)}
                      originalCurrency={tx.originalCurrency}
                      baseCurrency={baseCurrency}
                      type={
                        isRefund
                          ? 'income'
                          : breakdownType === 'expense'
                          ? 'expense'
                          : 'income'
                      }
                      className="text-xs font-mono font-medium shrink-0"
                    />
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
