# Root Cause 診斷報告：桌面端測試時接近 50/50 概率拉起第三方密碼管理器

## 1. 故障現象描述

在桌面端（Windows / macOS）進行安全性測試時：
- 安全鎖設定了 1 分鐘後逾時鎖定。
- 將應用程式放置於後台（切換至其他視窗或背景等待）時，軟體在逾時後依然有接近 50% 的機率彈出「第三方密碼管理器」（例如 1Password、Bitwarden、Proton Pass 等瀏覽器擴充功能）的 Passkey 攔截視窗，或在第三方管理器與 Windows Hello 之間隨機交替出現。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`src/services/crypto/webAuthn.ts`（第 115～125 行）

```typescript
// 缺陷點：allowCredentials 未聲明 transports: ['internal']
requestOptions.allowCredentials = [
  {
    id: bytes,
    type: 'public-key',
    // 缺失：transports: ['internal']
  },
];
```

### 關鍵檔案 2：`src/components/security/AppLockOverlay.tsx`（第 101～106 行）

```typescript
// 缺陷點：桌面端多視窗情境下，非最小化窗口的 document.hidden 恆為 false
const isVisibleAndFocused =
  typeof document !== 'undefined' &&
  !document.hidden &&
  (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
```

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：WebAuthn 請求未聲明內部平台傳輸協定（`transports: ['internal']`），引發第三方密碼管理器爭搶攔截
1. 現代主流第三方密碼管理器（如 1Password、Bitwarden 等）的瀏覽器擴充功能，會在頁面全域 Hook 並封裝 `navigator.credentials.get` API 以接管 Passkey 登入體驗。
2. 依照 W3C WebAuthn 規範，若應用調用 `navigator.credentials.get` 時，未在 `allowCredentials` 中明確指定 `transports: ['internal']`（表示憑證存於本機硬體 TPM / Secure Enclave 等不可拆卸的內建認證器）：
   - 第三方密碼管理器會將該請求視為一般性/跨設備 Passkey 請求。
   - 密碼管理器的 Content Script 會攔截此請求並彈出自己的解鎖/驗證彈窗。
3. **50/50 競爭條件（Race Condition）**：
   第三方密碼管理器的擴充功能注入腳本與瀏覽器/作業系統底層原生認證器（Windows Hello）在非同步事件循環中爭奪攔截優先權。若擴充功能搶先命中則彈出第三方密碼管理器，若系統平台原生搶先則彈出 Windows Hello，導致桌面端呈現約 50/50 的隨機拉起現象。

### 根本原因 B：桌面端多工作業環境下 `document.hidden` 與 `document.hasFocus()` 的判斷盲區
1. 在桌面端多螢幕或多視窗環境下，使用者將軟體「放到後台」時，通常只是**將滑鼠點擊切換至另一個桌面視窗（如 VS Code、檔案總管或記事本），並未將 Zenance 視窗最小化**。
2. 根據 Page Visibility API 規範，只要視窗未被最小化且未切換瀏覽器標籤頁，**`document.hidden` 恆為 `false`**。
3. 在 Chromium / WebKit 核心中，當系統焦點切換至另一個作業系統原生程式而非同瀏覽器標籤時，網頁內的焦點事件傳播存在延遲，部分環境下 `document.hasFocus()` 仍會返回 `true`。
4. 1 分鐘定時器在後台觸發鎖定並掛載 `<AppLockOverlay />` 時，守衛條件被誤判為滿足，依然在後台自動觸發了 `handleBiometric()`，進而引發了密碼管理器的搶奪彈窗。
