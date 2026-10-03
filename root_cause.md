# Root Cause 診斷報告：新增交易記錄日期偶發顯示為「一/二天前」

## 1. 故障現象描述
使用者反饋：新增交易記錄時，正常情況下預設日期為「今天」，但有時會偶發變成「昨天」或「前天」（1～2 天前），且無法穩定找到明確的重現途徑。

---

## 2. 核心代碼定位
1. **常駐彈窗掛載與生命週期綁定**：
   - 檔案：`src/components/layout/AppLayout.tsx`
   - 代碼：`<AddTransactionModal isOpen={isAddModalOpen} ... />`
2. **表單初始化與過期 DefaultValues 重置**：
   - 檔案：`src/components/transactions/AddTransactionModal.tsx`
   - 位置 1（第 176～190 行）：`useForm<FormValues>({ defaultValues: { date: new Date().toISOString().split('T')[0] } })`
   - 位置 2（第 274～277 行）：開啟彈窗時執行無參 `reset()`
   - 位置 3（第 312～316 行）：切換收支/轉帳類型時執行無參 `reset()`
3. **UTC 時區跨日偏移**：
   - 檔案：`src/components/transactions/AddTransactionModal.tsx` 第 187 行
   - 檔案：`src/components/transactions/NumericKeypad.tsx` 第 271 行、第 337 行
   - 代碼：`new Date().toISOString().split('T')[0]`

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因一：PWA/單頁背景保活下，無參 `reset()` 導致表單還原為多天前 Mount 時的舊日期（核心主因）
- **架構機制**：`AddTransactionModal` 作為全域常駐組件，在使用者打開應用程式（PWA 或瀏覽器分頁）時即完成首次掛載（Mount）。
- **過期陷阱**：React Hook Form 的 `useForm({ defaultValues: { date: ... } })` 只會在組件**初次掛載**時執行一次 `new Date()` 求值並固定在內部狀態中。
- **重置缺陷**：
  - 在現代 PWA 或行動端瀏覽器中，使用者很少頻繁刷新或完全關閉分頁，應用程式常在手機背景存活 1 天、2 天甚至更久。
  - 當使用者在跨日後（例如 1 或 2 天後）點擊「+」新增交易時，`useEffect` 監聽到 `isOpen` 變為 `true`，進入 Add 模式並調用了**不帶參數的 `reset()`**（第 277 行）。
  - 根據 `react-hook-form` 的標準規範，不帶參數的 `reset()` 會**嚴格將表單所有字段還原回初次掛載時註冊的 `defaultValues`**。
  - 這導致表單中的 `date` 字段被重置為組件 1 天前或 2 天前掛載那一天的歷史日期，而沒有在彈窗開啟時重新獲取當前最新的「今天」。
  - 此外，當使用者在彈窗內切換「支出 / 收入 / 轉帳」類型時，`handleTypeChange`（第 316 行）同樣調用了無參 `reset()`，再度強制將日期沖刷回掛載當天的舊日期。
- **重現難以捉摸的原因**：只有當使用者長時間未關閉網頁/PWA 並在隔天或大後天打開彈窗時才會出現；一旦手動刷新頁面，組件重新 Mount，日期便又恢復為今天，因此讓使用者感覺「沒有確切的復現辦法」。

### 根因二：使用 `toISOString()` 導致 UTC 時間跨日時區回退
- **時區機制**：專案中使用 `new Date().toISOString().split('T')[0]` 獲取日期字串。
- **8 小時時差**：`.toISOString()` 輸出的是**零時區（UTC）時間**。對於東八區（UTC+8，如台灣、香港、新加坡、北京等）的使用者：
  - 每天凌晨 **00:00 至 08:00** 期間，本地時間已經是「今天」，但 UTC 時間仍處於「昨天」（相差 8 小時）。
  - 在此時段獲取到的日期字串天然就是昨天的日期。
- **雙重疊加**：如果使用者前天打開應用、昨天未刷新、且在今天的凌晨時段打開記帳，根因一（保活跨日）與根因二（UTC 凌晨跨日）會疊加，導致日期偏離當前本地時間達到整整 1 至 2 天。
