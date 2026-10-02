import { getCurrencySymbol, cn, formatAmountNumber } from '@/lib/utils';
import { SpringNumber, getRememberedNumber, setRememberedNumber } from '@/components/ui/SpringNumber';

export interface AmountDisplayProps {
  amount: number;
  originalCurrency?: string;
  baseCurrency?: string;
  isApproximate?: boolean;
  type?: 'income' | 'expense' | 'transfer' | 'loan' | 'neutral' | 'balance';
  showSign?: boolean;
  className?: string;
  /**
   * Whether to animate the numeric value with smooth spring physics
   */
  animated?: boolean;
  /**
   * Unique memory key for persisting previous numeric value across page transitions
   */
  memoryKey?: string;
}

export function AmountDisplay({
  amount,
  originalCurrency,
  baseCurrency = 'CNY',
  isApproximate,
  type = 'neutral',
  showSign = true,
  className,
  animated = false,
  memoryKey,
}: AmountDisplayProps) {
  const effectiveMemoryKey = memoryKey || (animated ? `amt-${type}-${baseCurrency}-${className || 'd'}` : undefined);
  
  // 核心：若有記憶快取且當前數值恰好為 0（非同步資料庫載入中），優先沿用快取數值，避免 0 態閃爍與佈局抖動
  const remembered = effectiveMemoryKey ? getRememberedNumber(effectiveMemoryKey) : undefined;
  const isPendingZero = amount === 0 && remembered !== undefined && remembered !== 0;
  const displayAmount = isPendingZero ? remembered : amount;

  if (effectiveMemoryKey && amount !== 0) {
    setRememberedNumber(effectiveMemoryKey, amount);
  }

  const effectiveIsApproximate = isApproximate !== undefined
    ? isApproximate
    : Boolean(originalCurrency && originalCurrency !== baseCurrency);
  const symbol = getCurrencySymbol(baseCurrency);
  const formattedAmount = formatAmountNumber(Math.abs(displayAmount));
  
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
      {animated ? (
        <SpringNumber value={Math.abs(displayAmount)} memoryKey={effectiveMemoryKey} />
      ) : (
        formattedAmount
      )}
    </span>
  );
}
