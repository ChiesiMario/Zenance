import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/services/db/db';

const API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
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
        
        // If we have rates and they are less than 24h old, skip sync
        if (lastUpdate && (now - new Date(lastUpdate.updatedAt).getTime() < SYNC_INTERVAL_MS)) {
          return;
        }

        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch exchange rates');
        
        const data = await response.json();
        const newRates = Object.entries(data.rates).map(([currency, rate]) => ({
          currency,
          rate: rate as number,
          updatedAt: new Date().toISOString()
        }));

        await db.exchange_rates.bulkPut(newRates);
      } catch (error) {
        console.error('Failed to sync exchange rates:', error);
      }
    };

    // Only run if online
    if (navigator.onLine) {
      syncRates();
    }

    const handleOnline = () => syncRates();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const getRate = (fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;
    if (!rates || rates.length === 0) return 1; // Fallback if no rates available

    const fromRate = rates.find(r => r.currency === fromCurrency)?.rate || 1;
    const toRate = rates.find(r => r.currency === toCurrency)?.rate || 1;

    // We store rates relative to USD (1 USD = X Currency).
    // So 1 fromCurrency = 1/fromRate USD
    // And 1/fromRate USD = (1/fromRate) * toRate toCurrency
    return toRate / fromRate;
  };

  return {
    rates,
    getRate,
  };
}
