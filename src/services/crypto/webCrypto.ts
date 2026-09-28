/**
 * Zenance Native Web Crypto Utilities (Zero external dependencies)
 * Standard: PBKDF2-HMAC-SHA256 (100,000 rounds) + AES-256-GCM (12-byte random IV)
 */

export interface CryptoEnvelope {
  v: 1; // Envelope schema version
  salt: string; // Base64 encoded 16-byte salt
  iv: string; // Base64 encoded 12-byte random IV
  ciphertext: string; // Base64 encoded ciphertext with GCM auth tag
}

export function isCryptoSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.crypto?.subtle);
}

/**
 * 將 Uint8Array 轉為標準 Base64 字串
 */
export function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * 將 Base64 字串還原為 Uint8Array
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 生成密碼學安全的隨機字節緩衝區
 */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * 透過密碼與隨機 Salt，經由 PBKDF2 (100,000 次疊代) 派生 AES-256-GCM 金鑰
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (!isCryptoSupported()) {
    throw new Error('Web Crypto API is not supported in this environment');
  }

  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 使用 AES-256-GCM 加密任意資料物件，輸出安全密文信封
 */
export async function encryptPayload<T>(
  data: T,
  key: CryptoKey,
  salt: Uint8Array
): Promise<CryptoEnvelope> {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const plaintext = encoder.encode(jsonString);

  // 每次加密強制生成獨立的 12-byte IV，杜絕重用風險
  const iv = generateRandomBytes(12);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    plaintext
  );

  return {
    v: 1,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(encryptedBuffer)),
  };
}

/**
 * 解密密文信封並校驗認證標籤，還原為原始物件
 */
export async function decryptPayload<T>(
  envelope: CryptoEnvelope,
  key: CryptoKey
): Promise<T> {
  const iv = base64ToBuffer(envelope.iv);
  const ciphertext = base64ToBuffer(envelope.ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    ciphertext as BufferSource
  );

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonString) as T;
}

/**
 * 判斷一個物件是否為加密封裝信封 (Crypto Envelope)
 */
export function isCryptoEnvelope(obj: any): obj is CryptoEnvelope {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.v === 1 &&
    typeof obj.salt === 'string' &&
    typeof obj.iv === 'string' &&
    typeof obj.ciphertext === 'string'
  );
}

/**
 * 雜湊本地 PIN 碼 (PBKDF2 10,000 次雜湊)
 */
export async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 10000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToBase64(new Uint8Array(hashBuffer));
}

/**
 * 生成 24 位緊急恢復救援代碼 (Emergency Recovery Key)
 * 格式: ZEN-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey(): string {
  const bytes = generateRandomBytes(15);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  return `ZEN-${hex.slice(0, 5)}-${hex.slice(5, 10)}-${hex.slice(10, 15)}-${hex.slice(15, 20)}-${hex.slice(20, 25)}`;
}
