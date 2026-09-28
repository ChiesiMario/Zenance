import { db, type ExchangeRate } from '@/services/db/db';

const RATE_SOURCES = [
  'https://api.exchangerate-api.com/v4/latest/USD',
  'https://open.er-api.com/v6/latest/USD',
  'https://api.frankfurter.dev/v1/latest?base=USD',
];

// 歷史匯率在記憶體中的 LRU 快取字典: `${date}_${from}_${to}` -> rate
const historicalRateMemoryCache = new Map<string, number>();

/**
 * 多源降級獲取最新基準匯率 (相對 USD)
 * 依序輪詢主備源，首選失敗自動無縫切換備用源
 */
export async function fetchLatestRatesWithFallback(): Promise<Record<string, number> | null> {
  let lastError: any = null;

  for (const url of RATE_SOURCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒超時

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      const rawRates = data.rates;
      if (!rawRates || typeof rawRates !== 'object') continue;

      const now = new Date().toISOString();
      const ratesToStore: ExchangeRate[] = Object.entries(rawRates).map(([currency, rate]) => ({
        currency: currency.toUpperCase(),
        rate: Number(rate),
        updatedAt: now,
      }));

      // 補上 USD 本幣為 1
      if (!rawRates['USD']) {
        ratesToStore.push({ currency: 'USD', rate: 1, updatedAt: now });
      }

      await db.exchange_rates.bulkPut(ratesToStore);

      const ratesMap: Record<string, number> = {};
      ratesToStore.forEach((r) => {
        ratesMap[r.currency] = r.rate;
      });

      return ratesMap;
    } catch (err) {
      lastError = err;
      console.warn(`Exchange rate source failed (${url}), trying fallback...`, err);
    }
  }

  console.error('All exchange rate sources failed:', lastError);
  return null;
}

/**
 * 獲取歷史指定日期的匯率 (支援快取與離線降級)
 * @param fromCurrency 來源幣種
 * @param toCurrency 目標幣種
 * @param dateStr 歷史日期 YYYY-MM-DD
 * @param fallbackRate 當無歷史記錄或離線時的降級備用最新匯率
 */
export async function getHistoricalRateWithFallback(
  fromCurrency: string,
  toCurrency: string,
  dateStr?: string,
  fallbackRate: number = 1
): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;

  const todayStr = new Date().toISOString().slice(0, 10);
  if (!dateStr || dateStr >= todayStr) {
    return fallbackRate;
  }

  // 1. 檢查記憶體快取
  const cacheKey = `${dateStr}_${from}_${to}`;
  if (historicalRateMemoryCache.has(cacheKey)) {
    return historicalRateMemoryCache.get(cacheKey)!;
  }

  // 2. 聯網時調用 Frankfurter 開源歐洲央行歷史匯率 API
  if (navigator.onLine) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = `https://api.frankfurter.dev/v1/${dateStr}?base=USD`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const rates = data.rates || {};
        rates['USD'] = 1;

        const fromRate = rates[from] || (from === 'USD' ? 1 : null);
        const toRate = rates[to] || (to === 'USD' ? 1 : null);

        if (fromRate && toRate) {
          const rate = toRate / fromRate;
          historicalRateMemoryCache.set(cacheKey, rate);
          return rate;
        }
      }
    } catch {
      // 網路不通或超時，安全降級
    }
  }

  // 3. 離線或介面故障時，安全回退到最新匯率
  return fallbackRate;
}
