import {
  deriveKeyFromPassphrase,
  generateRandomBytes,
  bufferToBase64,
  base64ToBuffer,
  generateRecoveryKey,
  isCryptoSupported,
  encryptPayload,
  decryptPayload,
  type CryptoEnvelope,
} from './webCrypto';

const E2EE_CONFIG_KEY = 'zenance_e2ee_config';
export const E2EE_VERIFICATION_MAGIC = 'ZENANCE_E2EE_VERIFIED_V1';

export interface E2EEConfig {
  enabled: boolean;
  salt?: string; // Base64
  verificationEnvelope?: CryptoEnvelope;
  recoveryKeyHash?: string;
  createdAt?: string;
  updatedAt: string; // 狀態變更（開啟或關閉）的權威 ISO 時間戳
}

import {
  saveActiveKeyToVault,
  loadActiveKeyFromVault,
  clearActiveKeyFromVault,
} from './keyVault';

// 記憶體中的運行時金鑰快取
let memoryCryptoKey: CryptoKey | null = null;
let memorySalt: Uint8Array | null = null;
let isRestoringFromVaultPromise: Promise<boolean> | null = null;

export function getE2EEConfig(): E2EEConfig | null {
  try {
    const raw = localStorage.getItem(E2EE_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as E2EEConfig) : null;
  } catch {
    return null;
  }
}

export function isE2EEEnabled(): boolean {
  const config = getE2EEConfig();
  return Boolean(config?.enabled && config?.salt);
}

export function isE2EEUnlocked(): boolean {
  if (!isE2EEEnabled()) return true; // 未啟用視為無需解鎖
  return memoryCryptoKey !== null;
}

export function getE2EEUpdatedAt(): string {
  const config = getE2EEConfig();
  return config?.updatedAt || config?.createdAt || '';
}

export function getActiveCryptoKey(): CryptoKey | null {
  return memoryCryptoKey;
}

export function getActiveSalt(): Uint8Array | null {
  return memorySalt;
}

export function setupE2EEInMemoryKey(key: CryptoKey, salt: Uint8Array): void {
  memoryCryptoKey = key;
  memorySalt = salt;
}

/**
 * 靜默初始化：從本地 KeyVault 恢復已持久化的金鑰
 * 確保在同一設備上，一旦驗證過密碼後，無論刷新頁面或重開 PWA 均始終維持已解鎖狀態
 */
export async function initE2EEKey(): Promise<boolean> {
  if (!isE2EEEnabled()) return true;
  if (memoryCryptoKey !== null) return true;

  if (isRestoringFromVaultPromise) {
    return isRestoringFromVaultPromise;
  }

  isRestoringFromVaultPromise = (async () => {
    try {
      const vault = await loadActiveKeyFromVault();
      if (vault && vault.key && vault.salt) {
        const config = getE2EEConfig();
        if (!config || !config.salt || bufferToBase64(vault.salt) !== config.salt) {
          return false;
        }
        // 若存在校驗信封，驗證金鑰是否與當前配置匹配
        if (config.verificationEnvelope) {
          try {
            const decrypted = await decryptPayload<string>(config.verificationEnvelope, vault.key);
            if (decrypted !== E2EE_VERIFICATION_MAGIC) {
              return false;
            }
          } catch {
            return false;
          }
        }
        memoryCryptoKey = vault.key;
        memorySalt = vault.salt;
        return true;
      }
    } catch (err) {
      console.warn('Silent key restoration error:', err);
    } finally {
      isRestoringFromVaultPromise = null;
    }
    return false;
  })();

  return isRestoringFromVaultPromise;
}

// 模組加載時自動觸發靜默預加載
if (typeof window !== 'undefined') {
  initE2EEKey().catch(() => {});
}

/**
 * 跨設備同步：從遠端 manifest.json 匯入 E2EE 鹽值與校驗信封，標記本地需要解鎖
 */
export function importRemoteE2EEConfig(
  salt: string,
  verificationEnvelope?: CryptoEnvelope,
  remoteUpdatedAt?: string
): void {
  const current = getE2EEConfig();
  if (current?.enabled && current?.salt === salt) {
    let changed = false;
    if (!current.verificationEnvelope && verificationEnvelope) {
      current.verificationEnvelope = verificationEnvelope;
      changed = true;
    }
    if (remoteUpdatedAt && remoteUpdatedAt > (current.updatedAt || '')) {
      current.updatedAt = remoteUpdatedAt;
      changed = true;
    }
    if (changed) {
      localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(current));
    }
    return;
  }

  const now = new Date().toISOString();
  const config: E2EEConfig = {
    enabled: true,
    salt,
    verificationEnvelope,
    createdAt: current?.createdAt || now,
    updatedAt: remoteUpdatedAt || now,
  };

  localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(config));
  memoryCryptoKey = null;
  memorySalt = null;
  clearActiveKeyFromVault().catch(() => {});
}

/**
 * 初次在當前設備啟用端到端加密 (生成 Salt、衍生 Key、生成驗證信封與救援金鑰)
 */
export async function setupE2EE(
  passphrase: string
): Promise<{ recoveryKey: string }> {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto is not supported in this browser context.');
  }

  const salt = generateRandomBytes(16);
  const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt);
  const recoveryKey = generateRecoveryKey();

  // 生成本地校驗信封，供後續解鎖時即時檢驗密碼正確性
  const verificationEnvelope = await encryptPayload(E2EE_VERIFICATION_MAGIC, cryptoKey, salt);

  const now = new Date().toISOString();
  const config: E2EEConfig = {
    enabled: true,
    salt: bufferToBase64(salt),
    verificationEnvelope,
    recoveryKeyHash: recoveryKey, // 保留救援金鑰以供本地展示
    createdAt: now,
    updatedAt: now,
  };

  localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(config));
  memoryCryptoKey = cryptoKey;
  memorySalt = salt;

  // 持久化至本機安全金庫
  await saveActiveKeyToVault(cryptoKey, salt);

  return { recoveryKey };
}

/**
 * 透過密碼解鎖當前會話的 E2EE 金鑰 (具備校驗信封即時驗證能力，並持久化至本地金庫)
 */
export async function unlockE2EE(passphrase: string): Promise<boolean> {
  const config = getE2EEConfig();
  if (!config || !config.salt) return false;

  try {
    const salt = base64ToBuffer(config.salt);
    const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt);

    // 若存在校驗信封，立即校驗密碼正確性
    if (config.verificationEnvelope) {
      try {
        const decrypted = await decryptPayload<string>(config.verificationEnvelope, cryptoKey);
        if (decrypted !== E2EE_VERIFICATION_MAGIC) {
          return false;
        }
      } catch {
        // 解密失敗 (GCM tag mismatch)，確認密碼錯誤
        return false;
      }
    } else {
      // 舊版或尚未生成校驗信封，為其補齊 verificationEnvelope 以利後續快速檢驗
      try {
        const verificationEnvelope = await encryptPayload(E2EE_VERIFICATION_MAGIC, cryptoKey, salt);
        config.verificationEnvelope = verificationEnvelope;
        localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(config));
      } catch (e) {
        console.warn('Failed to upgrade legacy E2EE config with verification envelope:', e);
      }
    }

    memoryCryptoKey = cryptoKey;
    memorySalt = salt;

    // 持久化至本地安全金庫，設備重啟後無需重複輸入密碼
    await saveActiveKeyToVault(cryptoKey, salt);
    return true;
  } catch (err) {
    console.error('Failed to unlock E2EE with passphrase:', err);
    return false;
  }
}

/**
 * 關閉端到端加密 (記錄關閉時間戳記，抹除本地金庫金鑰)
 */
export function disableE2EE(disabledAt?: string): void {
  const now = disabledAt || new Date().toISOString();
  const config: E2EEConfig = {
    enabled: false,
    updatedAt: now,
  };
  localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(config));
  memoryCryptoKey = null;
  memorySalt = null;
  clearActiveKeyFromVault().catch(() => {});
}


