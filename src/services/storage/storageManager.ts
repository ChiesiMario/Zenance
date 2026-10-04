/**
 * Browser StorageManager & Persistent Storage Utilities
 * Protects IndexedDB from automatic browser eviction (e.g. Safari 7-day ITP / Chrome disk pressure).
 */

export interface StorageEstimateResult {
  usage: number;
  quota: number;
  usageFormatted: string;
  quotaFormatted: string;
  percentUsed: string;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * 檢查當前是否處於標準安全上下文環境 (Secure Context)
 * 支援 localhost, 127.0.0.1 或 https 連線
 */
export function isSecureEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }
  const hostname = window.location.hostname;
  return (
    window.location.protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/**
 * 檢查當前站點是否已被授權持久化儲存 (Persistent Storage)
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (!isSecureEnvironment()) return false;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 主動向瀏覽器申請持久化儲存授權
 * 成功授權後，瀏覽器將豁免自動磁碟清理演算法
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (!isSecureEnvironment()) return false;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 估算當前站點的儲存空間佔用與總配額
 */
export async function getStorageEstimate(): Promise<StorageEstimateResult | null> {
  if (!isSecureEnvironment()) return null;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const percentUsed = quota > 0 ? ((usage / quota) * 100).toFixed(2) : '0';
      return {
        usage,
        quota,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota),
        percentUsed,
      };
    } catch {
      return null;
    }
  }
  return null;
}
