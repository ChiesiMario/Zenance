import { getCurrencySymbol, cn, formatAmountNumber, formatCompactNumber } from '@/lib/utils';

export interface AmountDisplayProps {
  amount?: number | null;
  originalCurrency?: string;
  baseCurrency?: string;
  isApproximate?: boolean;
  type?: 'income' | 'expense' | 'transfer' | 'loan' | 'neutral' | 'balance';
  showSign?: boolean;
  className?: string;
  /**
   * Kept for prop compatibility
   */
  animated?: boolean;
  /**
   * Kept for prop compatibility
   */
  memoryKey?: string;
  /**
   * Whether to display amount in compact notation (e.g. 10k, 1.2M)
   */
  compact?: boolean;
}

export function AmountDisplay({
  amount,
  originalCurrency,
  baseCurrency = 'CNY',
  isApproximate,
  type = 'neutral',
  showSign = true,
  className,
  compact = false,
}: AmountDisplayProps) {
  const symbol = getCurrencySymbol(baseCurrency);

  // 待定讀取態防禦：當資料庫尚未 Resolve 時展示等寬佔位符，絕不草率誤判為 0 元
  if (amount === undefined || amount === null || isNaN(amount)) {
    return (
      <span className={cn('font-mono tabular-nums font-medium select-text text-muted-foreground', className)}>
        {symbol}--
      </span>
    );
  }

  const displayAmount = amount;
  const effectiveIsApproximate = isApproximate !== undefined
    ? isApproximate
    : Boolean(originalCurrency && originalCurrency !== baseCurrency);
  const formattedAmount = compact
    ? formatCompactNumber(Math.abs(displayAmount))
    : formatAmountNumber(Math.abs(displayAmount));
  
  let colorClass = '';
  let sign = '';

  const isZero = Math.abs(displayAmount) < 0.000001;

  if (type === 'income') {
    colorClass = isZero ? 'text-foreground' : 'text-emerald-500';
    sign = '';
  } else if (type === 'expense') {
    colorClass = isZero ? 'text-foreground' : 'text-rose-500';
    sign = (showSign && !isZero) ? '-' : '';
  } else if (type === 'transfer') {
    colorClass = isZero ? 'text-foreground' : 'text-blue-500';
    sign = '';
  } else if (type === 'loan') {
    if (isZero) {
      colorClass = 'text-foreground';
      sign = '';
    } else if (displayAmount < 0) {
      colorClass = 'text-rose-500';
      sign = showSign ? '-' : '';
    } else {
      colorClass = 'text-emerald-500';
      sign = '';
    }
  } else if (type === 'balance') {
    if (isZero) {
      colorClass = 'text-foreground';
      sign = '';
    } else if (displayAmount > 0) {
      colorClass = 'text-emerald-500';
      sign = '';
    } else {
      colorClass = 'text-rose-500';
      sign = showSign ? '-' : '';
    }
  } else if (type === 'neutral') {
    if (showSign && displayAmount < 0 && !isZero) sign = '-';
  }

  return (
    <span className={cn('font-mono tabular-nums font-medium select-text', colorClass, className)}>
      {effectiveIsApproximate && '≈ '}
      {sign}
      {symbol}
      {formattedAmount}
    </span>
  );
}
