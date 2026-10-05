/**
 * Dropbox OAuth 2.0 with PKCE (Proof Key for Code Exchange)
 * Client-side authentication without exposing client secret.
 */

const SESSION_VERIFIER_KEY = 'zenance_dropbox_code_verifier';
const STORAGE_TOKENS_KEY = 'zenance_dropbox_tokens';
const STORAGE_CUSTOM_KEY = 'zenance_dropbox_custom_app_key';

export interface DropboxTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  expires_at: number; // Unix timestamp in ms
  account_id?: string;
  scope?: string;
}

/**
 * 取得當前有效的 Dropbox App Key
 */
export function getDropboxAppKey(): string {
  const custom = localStorage.getItem(STORAGE_CUSTOM_KEY);
  if (custom && custom.trim()) return custom.trim();
  return (import.meta.env.VITE_DROPBOX_APP_KEY as string || '').trim();
}

/**
 * 取得 OAuth 授權完成後的重定向目標 URI
 */
export function getDropboxRedirectUri(): string {
  return `${window.location.origin}/settings`;
}

/**
 * 生成符合 RFC 7636 規範的隨機 Code Verifier
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * 對 Code Verifier 執行 SHA-256 雜湊生成 Code Challenge
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * 將 Uint8Array 轉為安全無衝突的 Base64URL 字串
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 取得儲存在本地的 Dropbox 憑證 Token
 */
export function getStoredTokens(): DropboxTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_TOKENS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DropboxTokens;
  } catch {
    return null;
  }
}

/**
 * 儲存 Token 憑證至本地
 */
function setStoredTokens(tokens: DropboxTokens): void {
  localStorage.setItem(STORAGE_TOKENS_KEY, JSON.stringify(tokens));
}

/**
 * 清除已儲存的 Dropbox 登入憑證 (登出)
 */
export function clearDropboxTokens(): void {
  localStorage.removeItem(STORAGE_TOKENS_KEY);
  sessionStorage.removeItem(SESSION_VERIFIER_KEY);
}

/**
 * 檢查當前設備是否已登入 Dropbox
 */
export function isDropboxConnected(): boolean {
  const tokens = getStoredTokens();
  return Boolean(tokens?.access_token || tokens?.refresh_token);
}

/**
 * 發起 Dropbox OAuth 2.0 PKCE 授權跳轉
 */
export async function initiateDropboxAuth(): Promise<void> {
  const appKey = getDropboxAppKey();
  if (!appKey) {
    throw new Error('Dropbox App Key is not configured. Please set VITE_DROPBOX_APP_KEY.');
  }

  const verifier = generateCodeVerifier();
  sessionStorage.setItem(SESSION_VERIFIER_KEY, verifier);

  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = getDropboxRedirectUri();

  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', appKey);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('token_access_type', 'offline');

  window.location.href = authUrl.toString();
}

/**
 * 授權回跳後，透過 Auth Code 與本地 Code Verifier 換取 Token
 */
export async function exchangeCodeForTokens(code: string): Promise<DropboxTokens> {
  const appKey = getDropboxAppKey();
  if (!appKey) throw new Error('Missing Dropbox App Key');

  const verifier = sessionStorage.getItem(SESSION_VERIFIER_KEY);
  if (!verifier) {
    throw new Error('PKCE verification failed: Code verifier missing from session.');
  }

  const redirectUri = getDropboxRedirectUri();
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: appKey,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dropbox token exchange failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const expiresAt = Date.now() + (data.expires_in || 14400) * 1000;

  const tokens: DropboxTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 14400,
    expires_at: expiresAt,
    account_id: data.account_id,
    scope: data.scope,
  };

  setStoredTokens(tokens);
  sessionStorage.removeItem(SESSION_VERIFIER_KEY);

  return tokens;
}

/**
 * 自動檢查並刷新過期 Access Token (無感續約)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // 距離過期大於 5 分鐘，直接使用現存 access_token
  const isExpiringSoon = Date.now() > tokens.expires_at - 5 * 60 * 1000;
  if (!isExpiringSoon && tokens.access_token) {
    return tokens.access_token;
  }

  // 若需要刷新且擁有 refresh_token
  if (tokens.refresh_token) {
    const appKey = getDropboxAppKey();
    if (!appKey) return tokens.access_token || null;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: appKey,
      });

      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedTokens: DropboxTokens = {
          ...tokens,
          access_token: data.access_token,
          expires_in: data.expires_in || 14400,
          expires_at: Date.now() + (data.expires_in || 14400) * 1000,
        };
        setStoredTokens(updatedTokens);
        return updatedTokens.access_token;
      }

      // 若遠端回傳 400 invalid_grant 或 401，代表使用者已在 Dropbox 撤銷授權
      if (response.status === 400 || response.status === 401) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.error === 'invalid_grant' || response.status === 401) {
          console.warn('Dropbox refresh token revoked or invalid. Clearing stored credentials.');
          clearDropboxTokens();
          return null;
        }
      }
    } catch (err) {
      console.warn('Failed to refresh Dropbox access token silently:', err);
    }
  }

  return tokens.access_token || null;
}
