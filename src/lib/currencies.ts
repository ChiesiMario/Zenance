export interface CurrencyInfo {
  code: string;
  symbol: string;
  i18nKey: string;
  region: 'popular' | 'asia' | 'europe' | 'americas' | 'other';
  digits: number;
}

export const ALL_CURRENCIES: CurrencyInfo[] = [
  // --- Popular / Top 12 ---
  { code: 'USD', symbol: '$', i18nKey: 'currencies.USD', region: 'popular', digits: 2 },
  { code: 'TWD', symbol: 'NT$', i18nKey: 'currencies.TWD', region: 'popular', digits: 2 },
  { code: 'CNY', symbol: '¥', i18nKey: 'currencies.CNY', region: 'popular', digits: 2 },
  { code: 'EUR', symbol: '€', i18nKey: 'currencies.EUR', region: 'popular', digits: 2 },
  { code: 'JPY', symbol: '¥', i18nKey: 'currencies.JPY', region: 'popular', digits: 0 },
  { code: 'GBP', symbol: '£', i18nKey: 'currencies.GBP', region: 'popular', digits: 2 },
  { code: 'HKD', symbol: 'HK$', i18nKey: 'currencies.HKD', region: 'popular', digits: 2 },
  { code: 'KRW', symbol: '₩', i18nKey: 'currencies.KRW', region: 'popular', digits: 0 },
  { code: 'SGD', symbol: 'S$', i18nKey: 'currencies.SGD', region: 'popular', digits: 2 },
  { code: 'AUD', symbol: 'A$', i18nKey: 'currencies.AUD', region: 'popular', digits: 2 },
  { code: 'CAD', symbol: 'C$', i18nKey: 'currencies.CAD', region: 'popular', digits: 2 },
  { code: 'CHF', symbol: 'CHF', i18nKey: 'currencies.CHF', region: 'popular', digits: 2 },

  // --- Asia-Pacific ---
  { code: 'THB', symbol: '฿', i18nKey: 'currencies.THB', region: 'asia', digits: 2 },
  { code: 'VND', symbol: '₫', i18nKey: 'currencies.VND', region: 'asia', digits: 0 },
  { code: 'MYR', symbol: 'RM', i18nKey: 'currencies.MYR', region: 'asia', digits: 2 },
  { code: 'IDR', symbol: 'Rp', i18nKey: 'currencies.IDR', region: 'asia', digits: 0 },
  { code: 'PHP', symbol: '₱', i18nKey: 'currencies.PHP', region: 'asia', digits: 2 },
  { code: 'INR', symbol: '₹', i18nKey: 'currencies.INR', region: 'asia', digits: 2 },
  { code: 'NZD', symbol: 'NZ$', i18nKey: 'currencies.NZD', region: 'asia', digits: 2 },
  { code: 'MOP', symbol: 'MOP$', i18nKey: 'currencies.MOP', region: 'asia', digits: 2 },
  { code: 'BND', symbol: 'B$', i18nKey: 'currencies.BND', region: 'asia', digits: 2 },
  { code: 'PKR', symbol: '₨', i18nKey: 'currencies.PKR', region: 'asia', digits: 2 },
  { code: 'BDT', symbol: '৳', i18nKey: 'currencies.BDT', region: 'asia', digits: 2 },
  { code: 'KHR', symbol: '៛', i18nKey: 'currencies.KHR', region: 'asia', digits: 2 },
  { code: 'NPR', symbol: '₨', i18nKey: 'currencies.NPR', region: 'asia', digits: 2 },
  { code: 'LKR', symbol: 'Rs', i18nKey: 'currencies.LKR', region: 'asia', digits: 2 },
  { code: 'MNT', symbol: '₮', i18nKey: 'currencies.MNT', region: 'asia', digits: 2 },

  // --- Europe ---
  { code: 'SEK', symbol: 'kr', i18nKey: 'currencies.SEK', region: 'europe', digits: 2 },
  { code: 'NOK', symbol: 'kr', i18nKey: 'currencies.NOK', region: 'europe', digits: 2 },
  { code: 'DKK', symbol: 'kr', i18nKey: 'currencies.DKK', region: 'europe', digits: 2 },
  { code: 'PLN', symbol: 'zł', i18nKey: 'currencies.PLN', region: 'europe', digits: 2 },
  { code: 'CZK', symbol: 'Kč', i18nKey: 'currencies.CZK', region: 'europe', digits: 2 },
  { code: 'HUF', symbol: 'Ft', i18nKey: 'currencies.HUF', region: 'europe', digits: 0 },
  { code: 'RON', symbol: 'lei', i18nKey: 'currencies.RON', region: 'europe', digits: 2 },
  { code: 'ISK', symbol: 'kr', i18nKey: 'currencies.ISK', region: 'europe', digits: 0 },
  { code: 'TRY', symbol: '₺', i18nKey: 'currencies.TRY', region: 'europe', digits: 2 },
  { code: 'RUB', symbol: '₽', i18nKey: 'currencies.RUB', region: 'europe', digits: 2 },

  // --- Americas ---
  { code: 'MXN', symbol: 'Mex$', i18nKey: 'currencies.MXN', region: 'americas', digits: 2 },
  { code: 'BRL', symbol: 'R$', i18nKey: 'currencies.BRL', region: 'americas', digits: 2 },
  { code: 'ARS', symbol: 'Arg$', i18nKey: 'currencies.ARS', region: 'americas', digits: 2 },
  { code: 'CLP', symbol: 'CLP$', i18nKey: 'currencies.CLP', region: 'americas', digits: 0 },
  { code: 'COP', symbol: 'COL$', i18nKey: 'currencies.COP', region: 'americas', digits: 2 },
  { code: 'PEN', symbol: 'S/.', i18nKey: 'currencies.PEN', region: 'americas', digits: 2 },

  // --- Middle East & Africa (Other) ---
  { code: 'AED', symbol: 'د.إ', i18nKey: 'currencies.AED', region: 'other', digits: 2 },
  { code: 'SAR', symbol: '﷼', i18nKey: 'currencies.SAR', region: 'other', digits: 2 },
  { code: 'ILS', symbol: '₪', i18nKey: 'currencies.ILS', region: 'other', digits: 2 },
  { code: 'QAR', symbol: 'QR', i18nKey: 'currencies.QAR', region: 'other', digits: 2 },
  { code: 'KWD', symbol: 'KD', i18nKey: 'currencies.KWD', region: 'other', digits: 3 },
  { code: 'ZAR', symbol: 'R', i18nKey: 'currencies.ZAR', region: 'other', digits: 2 },
  { code: 'EGP', symbol: 'E£', i18nKey: 'currencies.EGP', region: 'other', digits: 2 },
  { code: 'NGN', symbol: '₦', i18nKey: 'currencies.NGN', region: 'other', digits: 2 },
  { code: 'KES', symbol: 'KSh', i18nKey: 'currencies.KES', region: 'other', digits: 2 },
];

export const POPULAR_CURRENCIES: CurrencyInfo[] = ALL_CURRENCIES.filter(
  (c) => c.region === 'popular'
);

const CURRENCY_MAP = new Map<string, CurrencyInfo>(
  ALL_CURRENCIES.map((c) => [c.code, c])
);

export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  if (!code) return undefined;
  return CURRENCY_MAP.get(code.toUpperCase());
}

export function getCurrencySymbolSafe(code: string): string {
  if (!code) return '$';
  const info = getCurrencyInfo(code);
  return info?.symbol || '$';
}
