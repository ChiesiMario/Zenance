/**
 * WebAuthn (Touch ID / FaceID / Windows Hello) Platform Authenticator Utilities
 * Strictly checks for secure context and platform authenticator availability.
 */

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. 必須在安全上下文 (HTTPS 或 localhost)
  if (!window.isSecureContext) return false;

  // 2. 檢測瀏覽器是否支援 WebAuthn
  if (!window.PublicKeyCredential) return false;

  // 3. 檢測設備是否具備平台級生物辨識模組 (Touch ID / FaceID)
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * 註冊本機生物辨識憑證 (Touch ID / FaceID 綁定)
 * @returns 註冊成功的憑證 ID (Base64)
 */
export async function registerBiometricCredential(
  userName = 'Zenance User'
): Promise<string | null> {
  const available = await isBiometricAvailable();
  if (!available) return null;

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  window.crypto.getRandomValues(userId);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Zenance',
      id: window.location.hostname,
    },
    user: {
      id: userId,
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // 限制為本機硬體生物辨識模組
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) return null;

    // 將二進位 credential ID 轉為 Base64 字串儲存
    const rawId = new Uint8Array(credential.rawId);
    let binary = '';
    for (let i = 0; i < rawId.byteLength; i++) {
      binary += String.fromCharCode(rawId[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn('Biometric registration was cancelled or failed:', err);
    return null;
  }
}

/**
 * 呼叫本機生物辨識驗證解鎖 (Touch ID / FaceID 驗證)
 */
export async function verifyBiometricCredential(
  credentialIdBase64?: string
): Promise<boolean> {
  const available = await isBiometricAvailable();
  if (!available) return false;

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60000,
    userVerification: 'required',
    rpId: window.location.hostname,
  };

  if (credentialIdBase64) {
    try {
      const binary = atob(credentialIdBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      // 不指定已廢棄的 transports，確保全平台 (Apple/Windows/Android) 現代 WebKit/Blink 核心原生相容
      requestOptions.allowCredentials = [
        {
          id: bytes,
          type: 'public-key',
        },
      ];
    } catch (e) {
      console.warn('Failed to parse biometric credential ID:', e);
    }
  }

  try {
    const assertion = await navigator.credentials.get({
      publicKey: requestOptions,
    });
    return Boolean(assertion);
  } catch (err: any) {
    // 使用者主動取消或生物特徵不匹配
    console.warn('Biometric verification cancelled or failed:', err?.message || err);
    return false;
  }
}
