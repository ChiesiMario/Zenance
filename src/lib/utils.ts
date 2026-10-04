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

/**
 * 將數值格式化為帶千分位字串：
 * - 若金額為整數（四捨五入到 2 位後無小數，例如 100 或 100.00），則不顯示小數點與 .00（如 100, 1,000）
 * - 若金額帶小數（例如 100.5 或 100.25），則保留標準 2 位小數（如 100.50, 100.25）
 */
export function formatAmountNumber(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  const isInteger = Math.abs(rounded % 1) < 0.00001;
  return val.toLocaleString(undefined, {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  });
}

/**
 * 將數值格式化為緊湊型縮寫字串（方案 A：千位小寫 k，百萬及以上大寫 M / B / T）：
 * - < 1,000：原樣呈現整數或標準小數
 * - >= 1,000 (k)、>= 1,000,000 (M)、>= 1,000,000,000 (B)、>= 1,000,000,000,000 (T)
 * - 緊湊數值最多保留 1 位小數，若為整數則省略小數點（例如 10k, 10.5k, 1.2M, 55B, 10,000T）
 * - 依循正統財務與金融標準，縮寫數值的整數部分一律保留千分位分隔符（如 10,000T、1,000,000T）
 * - 處理邊界進位（例如 999.96k 自動晉級為 1M 而非 1000k）
 * - 支援負數（例如 -10k）
 */
export function formatCompactNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);

  if (abs < 1000) {
    return sign + formatAmountNumber(abs);
  }

  const formatWithCommas = (num: number): string => {
    const isInteger = Math.abs(num % 1) < 0.00001;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: isInteger ? 0 : 1,
      maximumFractionDigits: isInteger ? 0 : 1,
    });
  };

  const tiers = [
    { threshold: 1e12, divisor: 1e12, symbol: 'T' },
    { threshold: 1e9, divisor: 1e9, symbol: 'B' },
    { threshold: 1e6, divisor: 1e6, symbol: 'M' },
    { threshold: 1e3, divisor: 1e3, symbol: 'k' },
  ];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (abs >= tier.threshold) {
      let scaled = abs / tier.divisor;
      let rounded = Math.round(scaled * 10) / 10;

      // 若四捨五入後達到 1000 且存在更高階單位，則升級到上一階
      if (rounded >= 1000 && i > 0) {
        const higherTier = tiers[i - 1];
        scaled = abs / higherTier.divisor;
        rounded = Math.round(scaled * 10) / 10;
        const formatted = formatWithCommas(rounded);
        return `${sign}${formatted}${higherTier.symbol}`;
      }

      const formatted = formatWithCommas(rounded);
      return `${sign}${formatted}${tier.symbol}`;
    }
  }

  return sign + formatAmountNumber(abs);
}

/**
 * 將數值格式化為帶貨幣符號的緊湊型縮寫字串（例如 NT$10k, $1.5M, -NT$20k）
 */
export function formatCompactAmount(val: number, currencySymbol: string = ''): string {
  if (!Number.isFinite(val)) return `${currencySymbol}0`;
  const isNegative = val < 0;
  const compactStr = formatCompactNumber(Math.abs(val));
  return `${isNegative ? '-' : ''}${currencySymbol}${compactStr}`;
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

/**
 * 判斷一筆交易是否為「餘額調整」系統交易：
 * - 排除退款子交易（具有 parentId）
 * - 必須為 income 或 expense
 * - 關聯的分類必須是系統分類（isSystem === true），且非退款分類
 */
export function isBalanceAdjustmentTx(
  tx?: { type: string; category?: string; parentId?: string } | null,
  categories?: { id: string; isSystem?: boolean; name?: string }[]
): boolean {
  if (!tx || tx.parentId) return false;
  if (tx.type !== 'income' && tx.type !== 'expense') return false;
  const cat = categories?.find((c) => c.id === tx.category);
  if (!cat?.isSystem) return false;
  const name = cat.name || '';
  const isRefundCat = name.includes('退款') || name.toLowerCase().includes('refund');
  return !isRefundCat;
}

/**
 * 取得當前設備本地時區的 YYYY-MM-DD 日期字串，徹底避免 UTC 凌晨跨日時差
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

