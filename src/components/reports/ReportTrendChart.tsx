import { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatAmountNumber, formatCompactAmount } from '@/lib/utils';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import type { PeriodType } from '@/pages/Reports';

export interface TrendPoint {
  label: string;
  fullLabel: string;
  expense: number;
  income: number;
  dateKey: string;
}

export interface ReportTrendChartProps {
  periodType: PeriodType;
  points: TrendPoint[];
  currencySymbol: string;
  averageValue?: number;
  activeBucketIdx: number | null;
  onSelectBucket: (idx: number | null) => void;
}

function getNiceMax(val: number): number {
  if (val <= 50) return 50;
  if (val <= 100) return 100;
  if (val <= 500) return Math.ceil(val / 50) * 50;
  if (val <= 2000) return Math.ceil(val / 200) * 200;
  if (val <= 10000) return Math.ceil(val / 1000) * 1000;
  return Math.ceil(val / 5000) * 5000;
}

export function ReportTrendChart({
  periodType,
  points,
  currencySymbol,
  averageValue,
  activeBucketIdx,
  onSelectBucket,
}: ReportTrendChartProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const rawMax = useMemo(() => {
    return Math.max(
      ...points.map(p => Math.max(p.expense, p.income)),
      0
    );
  }, [points]);

  const niceMax = useMemo(() => getNiceMax(rawMax), [rawMax]);

  // SVG 座標空間尺寸
  const svgWidth = 1000;
  const svgHeight = 240;
  const plotTop = 24;
  const plotBottom = 208;
  const plotHeight = plotBottom - plotTop;

  const n = points.length;

  // 計算各柱條與折線座標
  const layout = useMemo(() => {
    if (n === 0) return { columns: [], netPts: [], avgY: plotBottom };

    const slotWidth = svgWidth / n;
    const barWidth = Math.max(3, Math.min(slotWidth * 0.34, 20));
    const gap = Math.max(1.5, barWidth * 0.18);

    const columns = points.map((p, i) => {
      const centerX = (i + 0.5) * slotWidth;
      const expHeight = niceMax > 0 ? (p.expense / niceMax) * plotHeight : 0;
      const incHeight = niceMax > 0 ? (p.income / niceMax) * plotHeight : 0;

      const expX = centerX - barWidth - gap / 2;
      const expY = plotBottom - expHeight;

      const incX = centerX + gap / 2;
      const incY = plotBottom - incHeight;

      const net = p.income - p.expense;
      const netRatio = niceMax > 0 ? Math.min(1, Math.max(-1, net / niceMax)) : 0;
      // 將淨結餘映射到中位線上下浮動
      const midY = plotTop + plotHeight / 2;
      const netY = midY - netRatio * (plotHeight / 2);

      return {
        centerX,
        slotWidth,
        expX,
        expY,
        expHeight,
        incX,
        incY,
        incHeight,
        netX: centerX,
        netY,
        net,
      };
    });

    const avgY = averageValue && niceMax > 0
      ? plotBottom - (averageValue / niceMax) * plotHeight
      : plotBottom;

    return { columns, avgY };
  }, [points, niceMax, n, averageValue, plotHeight, plotBottom]);

  // 指針滑動處理
  const handlePointerMove = (clientX: number) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = rect.width > 0 ? x / rect.width : 0;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(pct * n)));
    onSelectBucket(idx);
  };

  // 當前選中的資料點
  const inspectedPoint = activeBucketIdx !== null && activeBucketIdx < points.length
    ? points[activeBucketIdx]
    : points.length > 0
      ? points[points.length - 1]
      : null;

  const expVal = inspectedPoint ? inspectedPoint.expense : 0;
  const incVal = inspectedPoint ? inspectedPoint.income : 0;
  const netVal = incVal - expVal;

  return (
    <div className="border border-border rounded-xl p-5 bg-card text-card-foreground shadow-none space-y-4">
      {/* 標題與圖例 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight font-mono uppercase text-foreground">
            {t('reports.trendTitle', '收支走勢')}
          </h3>
          <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
            {t('reports.hoverHint', '滑動或點擊圖表檢視每日明細')}
          </p>
        </div>

        {/* 圖例說明 */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground" />
            <span className="text-muted-foreground">{t('reports.expenseTrend', '支出')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-emerald-500" />
            <span className="text-muted-foreground">{t('reports.incomeTrend', '收入')}</span>
          </div>
          {averageValue !== undefined && averageValue > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-amber-500" />
              <span className="text-muted-foreground">
                {periodType === 'year'
                  ? t('reports.monthlyAvgBenchmark', '月均')
                  : t('reports.dailyAvgBenchmark', '日均')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 圖表畫布容器 */}
      <div
        ref={containerRef}
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
        onMouseLeave={() => onSelectBucket(null)}
      >
        {/* 懸停數據 HUD (豎排版，自動避讓當前柱條，支援超長金額自動跑馬燈) */}
        {activeBucketIdx !== null && inspectedPoint && (
          <div
            className={cn(
              'absolute top-3 z-30 pointer-events-none select-none',
              'w-48 sm:w-56 max-w-[calc(50%-0.75rem)] bg-card border border-border rounded-lg p-2.5 font-mono text-xs space-y-1.5',
              activeBucketIdx >= points.length / 2 ? 'left-3' : 'right-3'
            )}
          >
            <div className="text-[11px] font-bold text-foreground border-b border-border/60 pb-1 truncate">
              {inspectedPoint.fullLabel}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 whitespace-nowrap">{t('reports.expense', '支出')}</span>
                <div className="min-w-0 flex-1 flex justify-end">
                  <AutoMarquee align="right" className="font-bold text-foreground">
                    <span className="whitespace-nowrap select-text">
                      {currencySymbol}
                      {formatAmountNumber(expVal)}
                    </span>
                  </AutoMarquee>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 whitespace-nowrap">{t('reports.income', '收入')}</span>
                <div className="min-w-0 flex-1 flex justify-end">
                  <AutoMarquee align="right" className="font-bold text-emerald-500">
                    <span className="whitespace-nowrap select-text">
                      {currencySymbol}
                      {formatAmountNumber(incVal)}
                    </span>
                  </AutoMarquee>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0 pt-1 border-t border-border/40">
                <span className="text-muted-foreground shrink-0 whitespace-nowrap">{t('reports.netBalance', '淨結餘')}</span>
                <div className="min-w-0 flex-1 flex justify-end">
                  <AutoMarquee
                    align="right"
                    className={cn(
                      'font-bold',
                      netVal > 0
                        ? 'text-emerald-500'
                        : netVal < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    )}
                  >
                    <span className="whitespace-nowrap select-text">
                      {netVal < 0 ? '-' : netVal > 0 ? '+' : ''}
                      {currencySymbol}
                      {formatAmountNumber(Math.abs(netVal))}
                    </span>
                  </AutoMarquee>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 背景網格參考線與金額刻度 */}
        <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none text-[10px] font-mono text-muted-foreground/60 z-0">
          <div className="flex items-center justify-between border-b border-border/40 border-dashed pb-0.5">
            <span className="truncate max-w-[140px] sm:max-w-[200px]">
              {formatCompactAmount(niceMax, currencySymbol)}
            </span>
            <span className="text-[9px] uppercase tracking-wider shrink-0">{t('reports.peakScale', '峰值 Peak')}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/30 border-dashed pb-0.5">
            <span className="truncate max-w-[140px] sm:max-w-[200px]">
              {formatCompactAmount(niceMax / 2, currencySymbol)}
            </span>
            <span className="text-[9px] uppercase tracking-wider shrink-0">{t('reports.midScale', '中位基準')}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border pb-0.5">
            <span>{currencySymbol}0</span>
            <span className="text-[9px] uppercase tracking-wider shrink-0">{t('reports.baseScale', '基線 Base')}</span>
          </div>
        </div>

        {/* 空狀態 */}
        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <span className="text-xs font-mono text-muted-foreground/70 bg-card/90 px-3 py-1.5 rounded-full border border-border/60">
              {t('reports.noTransactions', '此期間尚無任何交易紀錄')}
            </span>
          </div>
        )}

        {/* SVG 圖表幾何實體 */}
        <svg
          className="absolute inset-0 w-full h-full p-4 pointer-events-none z-10 overflow-visible"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          {/* 均線基準（Dashed Benchmark Line） */}
          {averageValue !== undefined && averageValue > 0 && layout.avgY < plotBottom && (
            <g>
              <line
                x1={0}
                y1={layout.avgY}
                x2={svgWidth}
                y2={layout.avgY}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity={0.8}
              />
            </g>
          )}

          {/* 雙軌幾何柱 (Dual Column Bars) */}
          {layout.columns.map((col, idx) => {
            const isSelected = activeBucketIdx === idx;
            const pt = points[idx];
            if (!pt) return null;

            return (
              <g key={pt.dateKey || idx} opacity={isSelected || activeBucketIdx === null ? 1 : 0.45}>
                {/* 聚焦背景高亮槽 */}
                {isSelected && (
                  <rect
                    x={col.centerX - col.slotWidth / 2}
                    y={plotTop}
                    width={col.slotWidth}
                    height={plotHeight}
                    fill="currentColor"
                    className="text-muted/40"
                    rx={2}
                  />
                )}

                {/* 支出柱 (實色黑/白) */}
                {col.expHeight > 0 && (
                  <rect
                    x={col.expX}
                    y={col.expY}
                    width={Math.max(2, col.slotWidth * 0.34)}
                    height={col.expHeight}
                    rx={1.5}
                    className="fill-foreground transition-all duration-150"
                  />
                )}

                {/* 收入柱 (翡翠綠) */}
                {col.incHeight > 0 && (
                  <rect
                    x={col.incX}
                    y={col.incY}
                    width={Math.max(2, col.slotWidth * 0.34)}
                    height={col.incHeight}
                    rx={1.5}
                    fill="#10b981"
                    className="transition-all duration-150"
                  />
                )}
              </g>
            );
          })}

          {/* 互動選中指示垂直線 */}
          {activeBucketIdx !== null && layout.columns[activeBucketIdx] && (
            <line
              x1={layout.columns[activeBucketIdx].centerX}
              y1={plotTop}
              x2={layout.columns[activeBucketIdx].centerX}
              y2={plotBottom}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              className="text-foreground/60"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
