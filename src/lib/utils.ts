import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
