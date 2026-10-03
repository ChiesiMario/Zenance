# Root Cause Analysis: APP Security Lock 開啟失敗

## 1. 故障現象
在手機端設定「APP Security Lock」，輸入兩次相符且大於等於 4 位的 PIN 碼後，點擊「Enable Lock」，系統彈出錯誤訊息：「開啓失敗」（`t('security.enableLockFailed')`）。

---

## 2. 核心根因 (Root Cause)

### 根本原因：Web Crypto API 在非安全上下文（HTTP 連線）下被瀏覽器停用
- **調用鏈路**：
  1. 點擊「Enable Lock」觸發 `handleSavePinLock`（`src/pages/Settings.tsx`）。
  2. 通過長度校驗與二次比對後，調用 `useAppLockStore.enableLock(pin, enableBio, 0)`。
  3. `enableLock`（`src/store/useAppLockStore.ts` 第 142 行）首先執行安全環境檢測：
     ```typescript
     if (!isCryptoSupported()) return false;
     ```
  4. 檢測函式 `isCryptoSupported()`（`src/services/crypto/webCrypto.ts` 第 13-15 行）的定義為：
     ```typescript
     export function isCryptoSupported(): boolean {
       return typeof window !== 'undefined' && Boolean(window.crypto?.subtle);
     }
     ```
- **W3C 安全上下文規範限制**：
  - 根據 W3C *Web Cryptography API* 與 *Secure Contexts* 規範，底層密碼學模組 **`window.crypto.subtle` (SubtleCrypto) 被嚴格限制僅在安全上下文 (Secure Context，即 HTTPS 或 localhost / 127.0.0.1)** 中開放。
  - 當手機端真機透過局域網 IP（例如 `http://192.168.x.x:5173/` 或 `http://10.x.x.x:5173/`）訪問本地 Vite 開發伺服器時，協議為純明文 `http://` 且 Host 為局域網 IP，行動端瀏覽器（iOS Safari、Android Chrome 等）強制判定為非安全上下文（`window.isSecureContext === false`）。
  - 在此狀態下，瀏覽器**直接將 `window.crypto.subtle` 設為 `undefined`**。
  - 導致 `isCryptoSupported()` 返回 `false`，`enableLock` 命中唯一的失敗退出路徑返回 `false`，最終在 UI 上觸發 `security.enableLockFailed` 提示「開啓失敗」。

---

## 3. 受影響模組與檔案定位
1. **[src/services/crypto/webCrypto.ts](file:///d:/GitHub/Zenance/src/services/crypto/webCrypto.ts)**：
   - `isCryptoSupported()` 依賴 `window.crypto?.subtle`，在局域網 HTTP 下為 `false`。
   - `hashPin()` 使用 `window.crypto.subtle.importKey` 與 `deriveBits`，在無 SubtleCrypto 環境下無法執行。
2. **[src/store/useAppLockStore.ts](file:///d:/GitHub/Zenance/src/store/useAppLockStore.ts)**：
   - 第 142 行 `enableLock`：`if (!isCryptoSupported()) return false;` 是導致函數回傳 `false` 的唯一出口。
3. **[src/pages/Settings.tsx](file:///d:/GitHub/Zenance/src/pages/Settings.tsx)**：
   - 第 215-223 行 `handleSavePinLock`：接收到 `success === false` 後彈出 `toast.show(t('security.enableLockFailed'))`。
