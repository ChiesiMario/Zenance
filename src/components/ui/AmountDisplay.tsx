import { getCurrencySymbol, cn } from '@/lib/utils';
import { SpringNumber } from '@/components/ui/SpringNumber';

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
  const effectiveIsApproximate = isApproximate !== undefined
    ? isApproximate
    : Boolean(originalCurrency && originalCurrency !== baseCurrency);
  const symbol = getCurrencySymbol(baseCurrency);
  const formattedAmount = Math.abs(amount).toLocaleString(undefined, { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  });
  
  let colorClass = '';
  let sign = '';

  if (type === 'income') {
    colorClass = 'text-emerald-500';
    sign = '';
  } else if (type === 'expense') {
    colorClass = 'text-rose-500';
    sign = showSign ? '-' : '';
  } else if (type === 'transfer') {
    colorClass = 'text-blue-500';
    sign = '';
  } else if (type === 'loan') {
    if (amount < 0) {
      colorClass = 'text-rose-500';
      sign = showSign ? '-' : '';
    } else {
      colorClass = 'text-emerald-500';
      sign = '';
    }
  } else if (type === 'balance') {
    if (amount > 0) {
      colorClass = 'text-emerald-500';
      sign = '';
    } else if (amount < 0) {
      colorClass = 'text-rose-500';
      sign = showSign ? '-' : '';
    } else {
      colorClass = 'text-foreground';
      sign = '';
    }
  } else if (type === 'neutral') {
    if (showSign && amount < 0) sign = '-';
  }

  return (
    <span className={cn('font-mono tabular-nums font-medium select-text', colorClass, className)}>
      {effectiveIsApproximate && '≈ '}
      {sign}
      {symbol}
      {animated ? (
        <SpringNumber value={Math.abs(amount)} decimals={2} memoryKey={effectiveMemoryKey} />
      ) : (
        formattedAmount
      )}
    </span>
  );
}
