import { useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/services/db/db';
import {
  fetchLatestRatesWithFallback,
  getHistoricalRateWithFallback,
} from '@/services/rates/exchangeRateService';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const COMMON_CURRENCIES = [
  'CNY', 'TWD', 'USD', 'EUR', 'JPY', 'GBP', 'KRW', 'HKD'
];

export function useExchangeRates() {
  const rates = useLiveQuery(() => db.exchange_rates.toArray());

  useEffect(() => {
    const syncRates = async () => {
      try {
        const lastUpdate = await db.exchange_rates.orderBy('updatedAt').last();
        const now = Date.now();
        
        // 若已有匯率快取且未超過 24 小時，跳過重複同步
        if (lastUpdate && (now - new Date(lastUpdate.updatedAt).getTime() < SYNC_INTERVAL_MS)) {
          return;
        }

        // 調用多源輪詢與降級容錯模組
        await fetchLatestRatesWithFallback();
      } catch (error) {
        console.error('Failed to sync exchange rates:', error);
      }
    };

    if (navigator.onLine) {
      syncRates();
    }

    const handleOnline = () => syncRates();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const getRate = useCallback((fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;
    if (!rates || rates.length === 0) return 1;

    const fromRate = rates.find(r => r.currency === fromCurrency)?.rate || 1;
    const toRate = rates.find(r => r.currency === toCurrency)?.rate || 1;

    // 1 USD = fromRate FromCurrency, 1 USD = toRate ToCurrency
    return toRate / fromRate;
  }, [rates]);

  const getHistoricalRate = useCallback(async (
    fromCurrency: string,
    toCurrency: string,
    dateStr?: string
  ): Promise<number> => {
    const latest = getRate(fromCurrency, toCurrency);
    return await getHistoricalRateWithFallback(fromCurrency, toCurrency, dateStr, latest);
  }, [getRate]);

  return {
    rates,
    getRate,
    getHistoricalRate,
  };
}
