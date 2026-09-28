import {
  deriveKeyFromPassphrase,
  generateRandomBytes,
  bufferToBase64,
  base64ToBuffer,
  generateRecoveryKey,
  isCryptoSupported,
} from './webCrypto';

const E2EE_CONFIG_KEY = 'zenance_e2ee_config';

export interface E2EEConfig {
  enabled: boolean;
  salt: string; // Base64
  recoveryKeyHash?: string;
  createdAt: string;
}

// 記憶體中的運行時金鑰 (關閉頁面即釋放，不持久化至磁碟)
let memoryCryptoKey: CryptoKey | null = null;
let memorySalt: Uint8Array | null = null;

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

export function getActiveCryptoKey(): CryptoKey | null {
  return memoryCryptoKey;
}

export function getActiveSalt(): Uint8Array | null {
  return memorySalt;
}

/**
 * 初次在當前設備啟用端到端加密 (生成 Salt、衍生 Key、生成救援金鑰)
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

  const config: E2EEConfig = {
    enabled: true,
    salt: bufferToBase64(salt),
    recoveryKeyHash: recoveryKey, // 保留救援金鑰以供本地展示
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(E2EE_CONFIG_KEY, JSON.stringify(config));
  memoryCryptoKey = cryptoKey;
  memorySalt = salt;

  return { recoveryKey };
}

/**
 * 透過密碼解鎖當前會話的 E2EE 金鑰
 */
export async function unlockE2EE(passphrase: string): Promise<boolean> {
  const config = getE2EEConfig();
  if (!config || !config.salt) return false;

  try {
    const salt = base64ToBuffer(config.salt);
    const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt);
    memoryCryptoKey = cryptoKey;
    memorySalt = salt;
    return true;
  } catch (err) {
    console.error('Failed to unlock E2EE with passphrase:', err);
    return false;
  }
}

/**
 * 關閉端到端加密 (清空本機金鑰與設定)
 */
export function disableE2EE(): void {
  localStorage.removeItem(E2EE_CONFIG_KEY);
  memoryCryptoKey = null;
  memorySalt = null;
}
