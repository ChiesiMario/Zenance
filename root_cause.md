# Root Cause 診斷報告：Dropbox 雲端同步遇加密備份時提示 E2EE 已鎖定 (E2EE_LOCKED)

## 1. 故障現象描述

在以下兩種典型使用場景中，Dropbox 雲端同步會中斷並彈出錯誤提示 `E2EE_LOCKED`（或「同步未完成：E2EE_LOCKED」）：

1. **跨設備首次連線場景（新設備 / 新瀏覽器）**：
   - 設備 A 啟用了端到端加密（E2EE）並將加密帳本上傳至 Dropbox 雲端。
   - 設備 B 登入同一個 Dropbox 帳號進行連線同步時，同步流程直接中斷，提示 `E2EE_LOCKED`，無法下載或同步任何資料，且介面完全沒有提供任何彈窗引導使用者輸入加密密碼進行解密。
2. **同設備頁面重整 / 會話過期場景**：
   - 設備 A 已啟用 E2EE，但在瀏覽器重新整理（F5）、關閉分頁重開或閒置過後。
   - 觸發背景自動同步或點擊「立即同步」時，同樣失敗並提示 `E2EE_LOCKED`。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`src/services/sync/dropboxClient.ts`（第 116～131 行、第 145～154 行）

```typescript
// downloadJsonFile: 遇到密文信封但金鑰不存在時直接拋出未捕捉的異常
try {
  const raw = await response.json();
  if (isCryptoEnvelope(raw)) {
    const key = getActiveCryptoKey();
    if (!key) {
      throw new Error('E2EE_LOCKED'); // <--- 致命拋錯點
    }
    return await decryptPayload<T>(raw, key);
  }
  return raw as T;
} catch (err: any) {
  if (err?.message === 'E2EE_LOCKED') {
    throw err; // 原樣拋給上層 syncEngine
  }
  return null;
}

// uploadJsonFile: 未解鎖時未阻止上傳，反而靜默降級為明文上傳
let dataToUpload = data;
if (normalizedPath !== '/manifest.json' && isE2EEEnabled()) {
  const key = getActiveCryptoKey();
  const salt = getActiveSalt();
  if (key && salt) {
    dataToUpload = await encryptPayload(data, key, salt);
  }
}
```

### 關鍵檔案 2：`src/services/crypto/e2eeManager.ts`（第 19～48 行、第 81～95 行）

```typescript
// 運行時金鑰僅存在於 JS 模組記憶體中，刷新頁面即丟失
let memoryCryptoKey: CryptoKey | null = null;
let memorySalt: Uint8Array | null = null;

export function isE2EEEnabled(): boolean {
  const config = getE2EEConfig();
  return Boolean(config?.enabled && config?.salt);
}

export function isE2EEUnlocked(): boolean {
  if (!isE2EEEnabled()) return true;
  return memoryCryptoKey !== null;
}

export function getActiveCryptoKey(): CryptoKey | null {
  return memoryCryptoKey;
}

// 唯一的 unlockE2EE 函式僅在 AppLockOverlay（PIN 碼安全鎖）中被呼叫，
// 在同步生命週期、設定頁與首頁完全沒有任何調用點！
export async function unlockE2EE(passphrase: string): Promise<boolean> {
  const config = getE2EEConfig();
  if (!config || !config.salt) return false;
  ...
}
```

### 關鍵檔案 3：`src/services/sync/syncEngine.ts`（第 249～342 行、第 616～624 行）

```typescript
// executeSync: 進入同步流程前完全沒有前置檢查遠端 manifest.json 的 E2EE 狀態，
// 亦無金鑰解鎖前置防護
export async function executeSync(...): Promise<SyncResult> {
  ...
  try {
    // 未檢查遠端 manifest 是否加密，直接下載檔案
    const remoteFiles = await listRemoteFolder();
    ...
    // 下載時觸發 downloadJsonFile 拋出 E2EE_LOCKED
    const l = await downloadJsonFile<Ledger>(`${prefix}/ledger.json`);
    ...
  } catch (error: any) {
    // 捕獲異常並將字串 "E2EE_LOCKED" 傳遞給前端
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error?.message || 'Unknown sync error',
      actionTaken: 'up_to_date',
    };
  }
}
```

### 關鍵檔案 4：`src/hooks/useDropboxSync.ts`（第 73～96 行、第 138～154 行）

```typescript
// useDropboxSync: 僅在首次連線衝突時提供資料合併/覆蓋彈窗，
// 完全未針對 E2EE_LOCKED 提供解鎖攔截或密碼輸入對話框
const result = await executeSync(mode);
if (!result.success) {
  toast.show('同步未完成：' + (result.error || '請重試')); // 裸露報錯
}
```

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因一：記憶體金鑰無持久化與會話生命週期解耦（Transient Memory Key Trap）
1. 為了保障極致安全性，系統採用 Web Crypto API 派生 `CryptoKey`，並且刻意**不將金鑰持久化至磁碟或 localStorage**（`memoryCryptoKey` 僅為模組全域記憶體變數）。
2. 這導致當使用者關閉頁面、重新整理頁面（F5）或重啟 PWA 應用程式時，記憶體變數被垃圾回收重置為 `null`。
3. 此時本機的 `localStorage` 雖然記錄了 `enabled: true`，但系統處於「已啟用但已鎖定」的半癱瘓狀態；背景排程同步（`scheduleAutoSync`）或手動點擊「立即同步」呼叫 `downloadJsonFile` 時，因為 `getActiveCryptoKey() === null` 而必然命中 `throw new Error('E2EE_LOCKED')`。

---

### 根因二：跨設備同步缺失遠端 E2EE 元數據握手與金鑰導入機制（Missing Handshake & Import Protocol）
1. 設備 A 啟用 E2EE 後，遠端的 `manifest.json` 實際上已經記錄了公用元數據：
   `manifest.e2ee = { enabled: true, salt: e2eeConfig.salt }`（`manifest.json` 刻意以明文存儲，具備可讀性）。
2. 但設備 B 在點擊連線或同步時，`syncEngine.ts` **從未在下載任何實體資料前先檢視遠端 `manifest.e2ee`**。
3. 設備 B 的本機 `localStorage` 根本沒有該鹽值（`salt`）與 E2EE 設定，當 `downloadJsonFile` 讀到密文信封時，本機既無配置亦無金鑰，只能被迫拋出 `E2EE_LOCKED` 中斷流程。
4. 整個系統完全缺失了「偵測到遠端已加密 -> 讀取遠端 salt 導入本機配置 -> 彈出密碼輸入框要求使用者解鎖」的前置握手協議。

---

### 根因三：同步引擎對 `E2EE_LOCKED` 缺乏攔截型 UI 互動架構（No Unlock Interceptor / Modal）
1. 整個專案中，`unlockE2EE` 函式僅僅在 `AppLockOverlay.tsx`（PIN 碼安全鎖）的重設密碼流程中被偶然呼叫過一次。
2. 在 `Settings.tsx`、`useDropboxSync.ts` 以及主導覽介面中，**完全不存在任何一個用於解鎖 E2EE 雲端金鑰的專屬彈窗或互動元件**。
3. 當 `executeSync` 拋出 `E2EE_LOCKED` 時，外層邏輯直接將其當作普通網絡失敗或未知異常，以 Toast 形式冰冷地通知使用者「同步未完成：E2EE_LOCKED」，將使用者直接卡死在死胡同中，沒有任何輸入密碼以解鎖金鑰的途徑。

---

### 根因四：未解鎖狀態下 `uploadJsonFile` 靜默明文洩漏缺陷（Silent Plaintext Fallback Bug）
1. 在 `dropboxClient.ts` 的第 147～153 行中：
   ```typescript
   if (normalizedPath !== '/manifest.json' && isE2EEEnabled()) {
     const key = getActiveCryptoKey();
     const salt = getActiveSalt();
     if (key && salt) {
       dataToUpload = await encryptPayload(data, key, salt);
     }
   }
   ```
2. 當 `isE2EEEnabled()` 為 `true` 但處於鎖定狀態（`key === null`）時，條件判斷 `if (key && salt)` 不成立，程式不會拋錯中斷，反而**直接將未加密的本機明文資料直接覆蓋上傳至雲端**，導致原本加密的雲端備份被明文覆蓋，破壞端到端加密的完整性。
