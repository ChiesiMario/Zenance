/**
 * Anti-Clock-Skew & Monotonic Logical Time Utilities
 * Protects distributed sync from out-of-order writes caused by incorrect device clocks.
 */

const MAX_OBSERVED_TIME_KEY = 'zenance_max_observed_time';

/**
 * 取得當前本地或遠端觀察到的最高物理時間戳 (ms)
 */
export function getMaxObservedTimestamp(): number {
  try {
    const raw = localStorage.getItem(MAX_OBSERVED_TIME_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * 記錄外部（如雲端同步或遠端修訂）觀察到的最新有效時間戳
 */
export function recordObservedTimestamp(isoOrMs: string | number): void {
  try {
    const timeMs = typeof isoOrMs === 'string' ? new Date(isoOrMs).getTime() : isoOrMs;
    if (isNaN(timeMs) || timeMs <= 0) return;

    const currentMax = getMaxObservedTimestamp();
    if (timeMs > currentMax) {
      localStorage.setItem(MAX_OBSERVED_TIME_KEY, String(timeMs));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * 取得保證單調遞增的安全 ISO 時間戳
 * 若本機時鐘人為調慢或被惡意回撥，自動箝位在歷史最高觀察時間 + 1ms，絕不倒退
 */
export function getSafeMonotonicTimestamp(): string {
  const localNow = Date.now();
  const maxObserved = getMaxObservedTimestamp();

  // 若本機時間落後於曾觀察到的最新時間，向前遞增 1 毫秒
  const safeMs = Math.max(localNow, maxObserved + 1);
  localStorage.setItem(MAX_OBSERVED_TIME_KEY, String(safeMs));

  return new Date(safeMs).toISOString();
}
