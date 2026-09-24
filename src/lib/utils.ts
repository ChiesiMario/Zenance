import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseISO, isToday, isYesterday, format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    JPY: '¥',
    GBP: '£',
    CNY: '¥',
    TWD: 'NT$',
    KRW: '₩',
    HKD: 'HK$',
  };
  return symbols[currency] || '$';
}

export function formatDisplayAmount(amountStr: string): string {
  if (!amountStr) return '0';

  const hasOperators = /[+\-*/]/.test(amountStr) && !/^[+-]?\d+(\.\d+)?$/.test(amountStr);
  if (hasOperators) {
    return amountStr.replace(/(\d+(?:\.\d*)?)/g, (match) => {
      const parts = match.split('.');
      let integerPart = parts[0].replace(/^0+(?=\d)/, '');
      if (!integerPart) integerPart = '0';
      const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
      return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decimalPart;
    });
  }

  const parts = amountStr.split('.');
  let integerPart = parts[0];
  const isNegative = integerPart.startsWith('-');
  if (isNegative) integerPart = integerPart.slice(1);
  integerPart = integerPart.replace(/^0+(?=\d)/, '');
  if (isNegative) integerPart = '-' + (integerPart || '0');
  else if (!integerPart) integerPart = '0';

  const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return formattedInteger + decimalPart;
}

export function sanitizeAmountInput(
  rawVal: string,
  options?: { allowNegative?: boolean }
): string {
  if (!rawVal) return '';

  let val = rawVal.trim();
  const allowNegative = options?.allowNegative ?? false;

  let isNegative = false;
  if (allowNegative && val.startsWith('-')) {
    isNegative = true;
    val = val.slice(1);
    if (val === '') return '-';
  } else {
    val = val.replace(/-/g, '');
  }

  // Filter out any non-digit and non-dot characters
  val = val.replace(/[^0-9.]/g, '');

  if (val === '') {
    return isNegative ? '-' : '';
  }

  // Handle leading dot e.g. "." -> "0."
  if (val.startsWith('.')) {
    val = '0' + val;
  }

  // Split integer and decimals (only keep the first dot)
  const dotIndex = val.indexOf('.');
  let integerPart = dotIndex === -1 ? val : val.slice(0, dotIndex);
  let decimalPart = '';

  if (dotIndex !== -1) {
    const rawDecimal = val.slice(dotIndex + 1).replace(/\./g, '');
    decimalPart = '.' + rawDecimal.slice(0, 2);
  }

  // Remove superfluous leading zeros from integer part (e.g. "05" -> "5", "00" -> "0")
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+(?=\d)/, '');
  }

  return (isNegative ? '-' : '') + integerPart + decimalPart;
}

export function sortTransactionsDesc<T extends { date: string; createdAt?: string; id?: string }>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    const dateDiff = (b.date || '').localeCompare(a.date || '');
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = (b.createdAt || '').localeCompare(a.createdAt || '');
    if (createdDiff !== 0) return createdDiff;
    return (b.id || '').localeCompare(a.id || '');
  });
}

export function formatTransactionDateHeader(dateStr: string, t: (key: string) => string, lang: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return t('common.today');
  if (isYesterday(date)) return t('common.yesterday');

  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  const isChinese = lang === 'zh-TW' || lang === 'zh-CN' || lang.startsWith('zh');

  let str = '';
  if (isChinese) {
    str = isCurrentYear ? format(date, 'M月d日') : format(date, 'yyyy年M月d日');
    str = str.replace(/([0-9a-zA-Z])([一-龥])/g, '$1 $2').replace(/([一-龥])([0-9a-zA-Z])/g, '$1 $2');
  } else {
    str = isCurrentYear ? format(date, 'MMM d') : format(date, 'MMM d, yyyy');
  }

  return str;
}

/**
 * Safely evaluates basic math expression (+, -)
 * Returns the evaluated number formatted to max 2 decimals, or the original expression on failure
 */
export function evaluateAmountExpression(expr: string, allowNegative = false): string {
  try {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    // Strip trailing operators or dots
    const cleanExpr = trimmed.replace(/[+\-*/.]+$/, '').trim();
    if (!cleanExpr) return '';

    // Only allow numbers, +, -, and decimal points
    if (!/^[0-9+\-.\s]+$/.test(cleanExpr)) return expr;

    // Avoid multiple adjacent operators
    if (/[+-]{2,}/.test(cleanExpr.replace(/^[+-]/, ''))) return expr;

    // Evaluate
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${cleanExpr})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      if (!allowNegative && result < 0) {
        return '0';
      }
      // Round to 2 decimal places
      const rounded = Math.round(result * 100) / 100;
      return rounded.toString();
    }
  } catch {
    // Ignore syntax errors during typing
  }
  return expr;
}
