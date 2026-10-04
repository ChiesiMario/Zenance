import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatCompactNumber } from '@/lib/utils';
import { getRememberedNumber, setRememberedNumber } from '@/lib/numberMemory';
import { useAppStore } from '@/store/useAppStore';

export const BADGE_PILL_CLASS =
  'inline-flex items-center justify-center h-4.5 text-[10px] font-mono font-medium px-1.5 rounded-full border border-border/80 text-muted-foreground bg-muted/40 select-none tracking-normal shrink-0 leading-none transition-opacity';

export interface MagnitudeBadgeProps {
  /** 金額數值 */
  amount: number | null | undefined;
  /** 觸發顯示微膠囊的絕對值門檻，預設 10,000 */
  threshold?: number;
  /** 自訂 class */
  className?: string;
  /** 是否顯式顯示正號，預設 false */
  showPositiveSign?: boolean;
  /** 跨頁面過渡的記憶快取鍵，避免資料載入時徽章閃縮推擠標題 */
  memoryKey?: string;
}

export const MagnitudeBadge: React.FC<MagnitudeBadgeProps> = ({
  amount,
  threshold = 10000,
  className,
  showPositiveSign = false,
  memoryKey,
}) => {
  const { activeLedgerId } = useAppStore();
  const scopedMemoryKey = memoryKey ? `${activeLedgerId || 'global'}:${memoryKey}` : undefined;
  const isInvalid = amount === undefined || amount === null || isNaN(amount) || amount === 0;
  const remembered = scopedMemoryKey ? getRememberedNumber(scopedMemoryKey) : undefined;
  const effectiveAmount = isInvalid && remembered !== undefined ? remembered : amount;

  if (scopedMemoryKey && amount !== undefined && amount !== null && !isNaN(amount) && amount !== 0) {
    setRememberedNumber(scopedMemoryKey, amount);
  }

  if (effectiveAmount === undefined || effectiveAmount === null || isNaN(effectiveAmount)) {
    return null;
  }

  const abs = Math.abs(effectiveAmount);
  if (abs < threshold) {
    return null;
  }

  const isPositive = effectiveAmount > 0;
  const sign = showPositiveSign && isPositive ? '+' : '';
  const badgeText = `${sign}${formatCompactNumber(effectiveAmount)}`;

  return (
    <span className={cn(BADGE_PILL_CLASS, className)}>
      {badgeText}
    </span>
  );
};

export const EstimatedRateBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  return (
    <span className={cn(BADGE_PILL_CLASS, className)}>
      ≈ {t('accounts.rateEstimated')}
    </span>
  );
};


