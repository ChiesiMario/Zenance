# Root Cause 診斷報告：桌面端測試時 Bitwarden 密碼管理器強制攔截 WebAuthn 生物辨識

## 1. 故障現象確認

根據使用者提供的實際測試截圖：
- 左側為 Zenance 獨立 PWA 視窗，介面處於「應用程式已鎖定」並提示「正在驗證生物識別...」。
- 右側彈出並奪取焦點的視窗為 **Bitwarden 瀏覽器擴充功能的原生 Passkey 攔截彈窗**：
  - 標題顯示：`zenance.pages.dev`
  - 提示文字：`Unlock to sign in with passkey.`
  - 要求輸入：`Enter Master Password to unlock`

---

## 2. 核心代碼與環境層級定位

### 關鍵檔案：`src/services/crypto/webAuthn.ts`（第 127～131 行）

```typescript
const assertion = await navigator.credentials.get({
  publicKey: requestOptions,
});
```

### 關鍵環境：瀏覽器擴充功能注入腳本（Bitwarden Extension Content Script）
- 全域物件被竄改：`window.navigator.credentials.get` 被 Bitwarden 擴充功能在頁面初始化時進行了 Monkey-patch（原型鏈封裝劫持）。

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：Bitwarden 擴充功能的「Passkey 提供商 (Passkey Provider)」全域注入機制
1. 現代主流第三方密碼管理器（以 Bitwarden 為代表）在瀏覽器擴充功能中內建了「作為 Passkey 提供商」的功能。
2. 擴充功能透過 Content Script，在瀏覽器所有網頁載入的最早階段，直接**覆寫（Wrap / Monkey-patch）了全域原生 `navigator.credentials.get` 與 `navigator.credentials.create`**。
3. 當網頁端 JavaScript 調用 `navigator.credentials.get` 時，該呼叫**完全不會直接到達作業系統（Windows Hello）**，而是直接被 Bitwarden 的注入腳本先行捕獲。

### 根本原因 B：保險庫鎖定（Vault Locked）時的「盲攔截」機制
1. 從截圖可以明確看出：使用者的 Bitwarden 擴充功能當前處於**未解鎖（Vault Locked）**狀態（顯示 `Enter Master Password to unlock`）。
2. 在保險庫鎖定狀態下，Bitwarden 本地數據庫處於 AES 密鑰加密狀態：
   - Bitwarden **完全無法解密其保險庫**，因此它**根本無法得知自己是否儲存了 `zenance.pages.dev` 的 Passkey**。
   - 同時，出於安全性防範，Bitwarden 無法預先信任網頁傳入的 `transports: ['internal']` 等前端參數。
3. **連鎖反應**：
   Bitwarden 只能採取最嚴格的「盲攔截策略」——**只要網頁發起任何 `navigator.credentials.get`，Bitwarden 一律強制彈出主密碼解鎖視窗**，要求使用者先解鎖 Bitwarden，以便它進一步查詢保險庫。
4. 這導致原生 Windows Hello 在此階段完全被 Bitwarden 阻斷在擴充功能之後，作業系統認證器根本沒有任何被喚起的機會。

### 根本原因 C：WebAuthn 規範於「網站 Passkey」與「本地 App 鎖屏」的語意衝突
1. WebAuthn（FIDO2）在 W3C 規範設計初衷是**「網站遠端身分登入 (Passkey)」**，而非像 iOS/Android 本地原生 App 的**「純本地硬體鎖屏 (Local Biometric Lock Screen)」**。
2. 瀏覽器與所有第三方密碼管理器將 WebAuthn 預設視為「網路帳號登入行為」，因此密碼管理器會極度主動地介入爭奪接管權。
3. 只要桌面端瀏覽器安裝並啟用了 Bitwarden / 1Password 擴充功能且處於鎖定狀態，純前端調用 WebAuthn 必然會遭遇密碼管理器的強行攔截。
