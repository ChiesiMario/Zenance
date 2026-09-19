import { getCurrencySymbol, cn } from '@/lib/utils';

export interface AmountDisplayProps {
  amount: number;
  originalCurrency?: string;
  baseCurrency?: string;
  type?: 'income' | 'expense' | 'transfer' | 'loan' | 'neutral';
  showSign?: boolean;
  className?: string;
}

export function AmountDisplay({
  amount,
  originalCurrency,
  baseCurrency = 'CNY',
  type = 'neutral',
  showSign = true,
  className,
}: AmountDisplayProps) {
  const isApproximate = originalCurrency && originalCurrency !== baseCurrency;
  const symbol = getCurrencySymbol(baseCurrency);
  const formattedAmount = Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
  
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
  } else if (type === 'neutral') {
    if (showSign && amount < 0) sign = '-';
  }

  return (
    <span className={cn('font-mono font-medium', colorClass, className)}>
      {isApproximate && '≈ '}
      {sign}
      {symbol}
      {formattedAmount}
    </span>
  );
}
