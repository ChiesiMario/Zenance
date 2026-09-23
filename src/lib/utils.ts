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
  const parts = amountStr.split('.');
  const integerPart = parts[0];
  const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return formattedInteger + decimalPart;
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
