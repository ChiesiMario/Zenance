import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getRememberedNumber, setRememberedNumber } from '@/components/ui/SpringNumber';

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
  const { t, i18n } = useTranslation();

  const isInvalid = amount === undefined || amount === null || isNaN(amount) || amount === 0;
  const remembered = memoryKey ? getRememberedNumber(memoryKey) : undefined;
  const effectiveAmount = isInvalid && remembered !== undefined ? remembered : amount;

  if (memoryKey && amount !== undefined && amount !== null && !isNaN(amount) && amount !== 0) {
    setRememberedNumber(memoryKey, amount);
  }

  if (effectiveAmount === undefined || effectiveAmount === null || isNaN(effectiveAmount)) {
    return null;
  }

  const abs = Math.abs(effectiveAmount);
  if (abs < threshold) {
    return null;
  }

  const isNegative = effectiveAmount < 0;
  const sign = isNegative ? '-' : (showPositiveSign ? '+' : '');
  const lang = i18n.language || 'zh-TW';
  const isZh = lang.startsWith('zh');

  let badgeText = '';

  if (isZh) {
    if (abs >= 100_000_000) {
      // 億
      const val = abs / 100_000_000;
      const maxDigits = val >= 100 ? 1 : 2;
      const formattedVal = val.toLocaleString(lang, {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
      });
      const unit = t('common.magnitude.yi', '億');
      // 遵從 Pangu Spacing：中文與數字間插入一個半形空格
      badgeText = `${sign}${formattedVal} ${unit}`;
    } else {
      // 萬
      const val = abs / 10_000;
      const maxDigits = val >= 1000 ? 1 : 2;
      const formattedVal = val.toLocaleString(lang, {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
      });
      const unit = t('common.magnitude.wan', '萬');
      // 遵從 Pangu Spacing：中文與數字間插入一個半形空格
      badgeText = `${sign}${formattedVal} ${unit}`;
    }
  } else {
    // 英文體系 (K, M, B)
    if (abs >= 1_000_000_000) {
      const val = abs / 1_000_000_000;
      const formattedVal = val.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      const unit = t('common.magnitude.b', 'B');
      badgeText = `${sign}${formattedVal}${unit}`;
    } else if (abs >= 1_000_000) {
      const val = abs / 1_000_000;
      const formattedVal = val.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      const unit = t('common.magnitude.m', 'M');
      badgeText = `${sign}${formattedVal}${unit}`;
    } else {
      const val = abs / 1_000;
      const formattedVal = val.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      const unit = t('common.magnitude.k', 'K');
      badgeText = `${sign}${formattedVal}${unit}`;
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-4.5 text-[10px] font-mono font-medium px-1.5 rounded-full border border-border/80 text-muted-foreground bg-muted/40 select-none tracking-normal shrink-0 leading-none transition-opacity',
        className
      )}
    >
      {badgeText}
    </span>
  );
};
