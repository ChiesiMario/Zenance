# Root Cause 診斷報告：手機端「本機持久化保護」與「本機時光機備份」不可用

## 1. 故障現象描述

在手機端（包括 iOS Safari、Android Chrome、各品牌行動瀏覽器以及加入主畫面後的 PWA 模式）中，設定頁面出現以下兩項不可用現象：
1. **本機持久化保護不可用**：
   - 項目恆常處於未保護的「申請保護」狀態。
   - 使用者點擊「申請保護」後，提示「瀏覽器未授權持久化，將依設備容量自動管理」，狀態無法切換為綠色「已保護」。
2. **本機時光機備份不可用**：
   - 進入時光機彈窗後，底部的「立即建立快照」按鈕呈現灰階禁用（`disabled`）狀態，或點擊後彈出「建立時光機快照失敗」。
   - 快照列表恆常顯示「尚無時光機快照」，背景滾動備份機制未曾成功產出快照。
   - 在已產生快照的環境中，手機端點擊「匯出備份」無法順利將 ZIP 儲存至本機檔案系統。

---

## 2. 核心代碼定位

### 一、本機持久化保護相關代碼
1. **持久化檢測與申請介面**：
   - 檔案：`src/services/storage/storageManager.ts`（第 26～50 行）
     ```typescript
     export async function isStoragePersisted(): Promise<boolean> {
       if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
         try {
           return await navigator.storage.persisted();
         } catch {
           return false;
         }
       }
       return false;
     }

     export async function requestStoragePersistence(): Promise<boolean> {
       if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
         try {
           return await navigator.storage.persist();
         } catch {
           return false;
         }
       }
       return false;
     }
     ```
2. **設定頁面調用與反饋**：
   - 檔案：`src/pages/Settings.tsx`（第 231～234 行、第 904～927 行）
     ```typescript
     const handleRequestPersistence = async () => {
       const granted = await requestPersistence();
       toast.show(granted ? t('settings.persistenceGranted') : t('settings.persistenceDenied'));
     };
     ```

### 二、本機時光機備份相關代碼
1. **OPFS 支援度檢測**：
   - 檔案：`src/services/storage/opfsBackupService.ts`（第 43～45 行）
     ```typescript
     export function isOPFSSupported(): boolean {
       return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
     }
     ```
2. **主執行緒 OPFS 實體寫入調用**：
   - 檔案：`src/services/storage/opfsBackupService.ts`（第 212～222 行）
     ```typescript
     async function writeOpfsFile(filename: string, blob: Blob): Promise<void> {
       const dir = await getBackupsDirectory();
       if (!dir) throw new Error('OPFS not available');

       const fileHandle = await dir.getFileHandle(filename, { create: true });
       // @ts-ignore createWritable is part of modern FileSystemFileHandle
       const writable = await fileHandle.createWritable();
       await writable.write(blob);
       await writable.close();
     }
     ```
3. **備份流程的例外捕獲**：
   - 檔案：`src/services/storage/opfsBackupService.ts`（第 307～310 行）
     ```typescript
     } catch (err) {
       console.error('Failed to perform OPFS rolling backup:', err);
       return false;
     }
     ```
4. **手機端下載觸發**：
   - 檔案：`src/services/storage/opfsBackupService.ts`（第 373～387 行）
     ```typescript
     export async function downloadRollingBackupFile(filename: string): Promise<boolean> {
       const blob = await readOpfsFile(filename);
       if (!blob) return false;
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       // ... a.click() 下載觸發
     ```
5. **UI 禁用邏輯**：
   - 檔案：`src/pages/Settings.tsx`（第 1126 行）
     ```typescript
     disabled={isOpfsBackingUp || !isOpfsSupported}
     ```

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 第一部分：本機持久化保護在手機端失效的根因

#### 根因 1.1：iOS WebKit 的智慧防追蹤 (ITP) 與沙盒政策硬性拒絕常規網頁的持久化請求
- 根據 WebKit Storage 規範與 Apple 隱私政策（Intelligent Tracking Prevention, ITP），常規 iOS Safari 標籤頁被嚴格禁止鎖定磁碟持久空間，以防跨站廣告商濫用本地儲存永久留存識別資訊。
- 在 iOS 瀏覽器環境下，呼叫 `navigator.storage.persist()` **永遠被系統直接拒絕並返回 `false`**，絕不會彈出任何授權對話框。
- 即使使用者透過「加入主畫面 (Add to Home Screen)」將應用提升至獨立 PWA 模式，WebKit 仍採取不透明的啟發式判斷，若無極高頻率的前台互動或系統白名單支援，主動調用依然直接返回 `false`。

#### 根因 1.2：Android Chromium 的「純啟發式 (Heuristics-only)」授權判定
- 在 Android Chrome / Chromium 內核中，`navigator.storage.persist()` 不會像相機、麥克風或推播通知那樣觸發系統授權彈窗，而是採取全自動的啟發式評估（Engagement Heuristics）。
- Chromium 要求站點必須滿足下列條件之一才會靜默授予持久化：
  1. 站點已被安裝為 WebAPK（已加入主螢幕 PWA）；
  2. 站點已被授予高權限（如 Push Notifications 推播通知權限）；
  3. 站點具備高額的「站點參與度分數 (Site Engagement Score)」（需長期在該瀏覽器活躍使用）。
- 在普通手機分頁直接訪問時，啟發式判定直接不達標，導致方法靜默回傳 `false`。

#### 根因 1.3：安全上下文 (Secure Context) 缺失阻斷 Storage API
- `navigator.storage` 全套 API 規範要求運行於安全上下文（`window.isSecureContext === true`）。
- 當開發者或使用者在手機端透過區網 IP（例如 `http://192.168.x.x:3011`）測試 Vite 伺服器時，`window.isSecureContext` 為 `false`，行動瀏覽器會直接隱藏或禁用 `navigator.storage.persist` 與 `navigator.storage.persisted`，導致所有檢查與申請調用全部靜默失敗。

#### 根因 1.4：UI 狀態機缺乏針對行動端特性的情境反饋與「加入主畫面」引導
- 當 `requestPersistence()` 返回 `false` 時，程式僅顯示「瀏覽器未授權持久化，將依設備容量自動管理」，狀態依然停留在「申請保護」。
- 系統未針對行動端做環境偵測，未向使用者說明「iOS / Android 需將應用加入主畫面（PWA）方具備持久化防清理資格」，造成操作體驗上的死胡同。

---

### 第二部分：本機時光機備份在手機端失效的根因

#### 根因 2.1：iOS WebKit 主執行緒（Window Context）根本不支援 `fileHandle.createWritable()`
- 這是導致 iOS 設備時光機備份 100% 崩潰的核心罪魁禍首。
- 雖然 iOS Safari 15.2+ 支援了 OPFS（`navigator.storage.getDirectory()`），但 WebKit 的官方實作存在嚴重的執行緒限制：
  - WebKit 僅在 **Web Worker** 執行緒中支援同步存取控柄 `fileHandle.createSyncAccessHandle()`。
  - 在 **主執行緒 (Window Context)** 下，WebKit 長期未實作非同步流式寫入器 `fileHandle.createWritable()`（在 iOS 15、16、以及多數 iOS 17/18 穩定版中，此方法均為 `undefined`）。
- 代碼在 `writeOpfsFile()` 中直接呼叫：
  ```typescript
  const writable = await fileHandle.createWritable();
  ```
  在 iOS Safari 上會立刻拋出嚴重未捕獲異常：`TypeError: fileHandle.createWritable is not a function`。
- 該錯誤被 `performRollingBackup` 的外部 `catch` 捕獲，導致時光機快照寫入中斷並返回 `false`，UI 跳出「建立時光機快照失敗」，列表永無資料。

#### 根因 2.2：行動端 WebView 與非安全環境下 OPFS 完全缺失
- 在下列行動端環境中，OPFS 根本未被支援：
  1. 社群或通訊軟體內建瀏覽器（如微信、LINE、Facebook 內置 WebView 等）；
  2. 透過區域網路 IP（`http://192.168.x.x`）進行行動端除錯的環境（非 Secure Context）；
  3. 舊版行動瀏覽器（iOS < 15.2 或 Android 舊版系統 WebKit）。
- 在這些環境下，`navigator.storage?.getDirectory` 為 `undefined`，導致 `isOPFSSupported()` 回傳 `false`，時光機按鈕直接被全域禁用（`disabled`）。

#### 根因 2.3：架構層面完全缺乏「備份媒介降級機制 (Storage Fallback)」
- 目前的 `opfsBackupService.ts` 將備份功能全數硬性綑綁於新穎的 OPFS（Origin Private File System）單一媒介。
- 一旦瀏覽器不支援 OPFS 或不支援主執行緒 `createWritable`，整個時光機備份模組即徹底停擺。
- 事實上，Zenance 本身運行於全平台皆 100% 支援且容量充足的 IndexedDB（Dexie），但架構上並未為時光機備份建立以 IndexedDB 為備用的雙層存儲架構（例如 IndexedDB 獨立快照表），喪失了跨平台韌性。

#### 根因 2.4：iOS PWA Standalone 模式對 `<a>` 標籤虛擬點擊下載的系統級攔截
- 在 `downloadRollingBackupFile()` 中，程式透過建立虛擬 `<a>` 節點並觸發 `click()` 來下載 ZIP Blob。
- 在 iOS Standalone PWA（加入主畫面後的全螢幕 Web 應用）中，iOS 系統並未配備如桌面端瀏覽器般的下載管理員，對虛擬 `<a>` 標籤下載會進行靜默攔截或直接失靈，無法直接將檔案存入 iOS「檔案 (Files)」App。
