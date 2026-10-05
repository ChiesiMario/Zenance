/**
 * Zenance Native Key Vault (IndexedDB-backed secure local persistence for CryptoKey)
 * Uses browser structured clone to natively persist non-exportable CryptoKey instances.
 */

const DB_NAME = 'zenance_key_vault';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const E2EE_KEY_ID = 'active_e2ee_key';

interface StoredKeyRecord {
  id: string;
  cryptoKey: CryptoKey;
  salt: Uint8Array;
  updatedAt: string;
}

function openKeyVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open key vault'));
  });
}

/**
 * 將已驗證的 E2EE 金鑰安全持久化儲存至本機 IndexedDB 金庫
 */
export async function saveActiveKeyToVault(key: CryptoKey, salt: Uint8Array): Promise<void> {
  try {
    const db = await openKeyVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredKeyRecord = {
        id: E2EE_KEY_ID,
        cryptoKey: key,
        salt,
        updatedAt: new Date().toISOString(),
      };

      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to save key'));
    });
  } catch (err) {
    console.warn('Failed to save CryptoKey to local vault:', err);
  }
}

/**
 * 從本機 IndexedDB 金庫讀取已持久化的 E2EE 金鑰
 */
export async function loadActiveKeyFromVault(): Promise<{ key: CryptoKey; salt: Uint8Array } | null> {
  try {
    const db = await openKeyVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(E2EE_KEY_ID);

      req.onsuccess = () => {
        const record = req.result as StoredKeyRecord | undefined;
        if (record && record.cryptoKey && record.salt) {
          resolve({ key: record.cryptoKey, salt: record.salt });
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('Failed to load CryptoKey from local vault:', err);
    return null;
  }
}

/**
 * 從本機 IndexedDB 金庫中抹除 E2EE 金鑰 (停用加密時調用)
 */
export async function clearActiveKeyFromVault(): Promise<void> {
  try {
    const db = await openKeyVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(E2EE_KEY_ID);

      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // 即使刪除失敗也無需中斷
    });
  } catch (err) {
    console.warn('Failed to clear key vault:', err);
  }
}
