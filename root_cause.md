# Root Cause 診斷報告：切換帳本後多個頁面金額統計資訊未正確更新

## 1. 故障現象描述
使用者在切換帳本（例如在首頁 Dashboard 下拉選單或設定頁面切換當前帳本）後，多個頁面（包含 Dashboard、Accounts、Reports、Contacts 等）的金額統計卡片與指標未及時更新為新帳本的數值，而是持續顯示舊帳本的金額統計資訊與金融縮寫膠囊。

---

## 2. 核心代碼定位

1. **全域數字記憶體與靜態無作用域 Key（Global Memory Store without Ledger Scope）**：
   - 檔案：`src/components/ui/SpringNumber.tsx`（第 4～17 行）
     ```tsx
     const numberMemoryStore = new Map<string, number>();
     ```
   - 檔案：`src/pages/Dashboard.tsx`（第 401、410、420、429、437、447 行）
     ```tsx
     memoryKey="dashboard-net-balance"
     memoryKey="dashboard-income"
     memoryKey="dashboard-expense"
     ```
   - 檔案：`src/pages/Accounts.tsx`（第 353、362、370、379、387、396 行）
     ```tsx
     memoryKey="accounts-net-worth"
     memoryKey="accounts-total-wallets"
     memoryKey="accounts-net-loans"
     ```
   - 檔案：`src/pages/Reports.tsx`（第 513、529、542、547、566、571 行）
     ```tsx
     memoryKey="reports-net-balance"
     memoryKey="reports-total-expense"
     memoryKey="reports-total-income"
     ```
   - 檔案：`src/pages/Contacts.tsx`（第 219、228、236、245、253、262 行）
     ```tsx
     memoryKey="contacts-net-balance"
     memoryKey="contacts-total-receivable"
     memoryKey="contacts-total-payable"
     ```

2. **零態防閃爍邏輯對 0 元的硬性攔截（Zero-State Interception in Display Components）**：
   - 檔案：`src/components/ui/AmountDisplay.tsx`（第 36～39 行）
     ```tsx
     const remembered = effectiveMemoryKey ? getRememberedNumber(effectiveMemoryKey) : undefined;
     const isPendingZero = amount === 0 && remembered !== undefined && remembered !== 0;
     const displayAmount = isPendingZero ? remembered : amount;
     ```
   - 檔案：`src/components/ui/MagnitudeBadge.tsx`（第 30～32 行）
     ```tsx
     const remembered = memoryKey ? getRememberedNumber(memoryKey) : undefined;
     const isPendingZero = (amount === 0 || amount === undefined) && remembered !== undefined && remembered !== 0;
     const displayAmount = isPendingZero ? remembered : amount;
     ```
   - 檔案：`src/components/ui/SpringNumber.tsx`（第 94～97 行）
     ```tsx
     // 若是切換頁面或初始掛載階段，且剛好是 0 態（資料庫尚未返回），不朝 0 俯衝
     if (value === 0 && rememberedValue !== undefined && rememberedValue !== 0) {
       return;
     }
     ```

3. **Keep-Alive 分頁生命週期與 `display: none` 下的 RAF 凍結**：
   - 檔案：`src/components/layout/AppLayout.tsx`（第 208～229 行）
     ```tsx
     {mountedTabs.has('/accounts') && (
       <div style={{ display: location.pathname === '/accounts' ? 'block' : 'none' }}>
         <Accounts />
       </div>
     )}
     ```
   - 檔案：`src/store/useAppStore.ts`（第 56 行）
     ```tsx
     setActiveLedgerId: (id) => set({ activeLedgerId: id }),
     ```

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因一：`memoryKey` 全域快取跨帳本污染，導致新帳本零態（0 元）被強制劫持為舊帳本金額

1. **靜態 Key 缺乏帳本隔離（Ledger Isolation Defect）**：
   - 各頁面的統計卡片傳入的 `memoryKey` 皆為純靜態字串（如 `"dashboard-net-balance"`, `"accounts-net-worth"` 等），未與 `activeLedgerId` 綁定。
   - `numberMemoryStore` 是一個常駐於記憶體的全域 `Map<string, number>`，各帳本共用同一個 Key。

2. **零態保護機制引發的永久陳舊（Zero-State Lockup）**：
   - 當使用者從帳本 A 切換至帳本 B 時：
     - 若帳本 B 為空帳本、新建立帳本，或某項指標真實數值為 0（例如當月無支出、無借貸等），該組件計算出的真實 `amount` 為 `0`。
     - 但此時 `getRememberedNumber(memoryKey)` 抓取到的是帳本 A 的巨大金額（例如 100,000）。
     - 判定式 `amount === 0 && remembered !== 0` 恆為 `true`。
     - `AmountDisplay` 與 `MagnitudeBadge` 將 `displayAmount` 判定為 `remembered`（帳本 A 的舊值）；
     - `SpringNumber` 執行至 `if (value === 0 && rememberedValue !== undefined && rememberedValue !== 0) return;` 直接終止回調，不執行動畫且不更新 `displayValue`。
   - 由於真實值 `amount === 0`，永遠無法滿足 `if (memoryKey && amount !== 0) setRememberedNumber(...)`，導致全域快取永遠不會被覆寫，畫面永久鎖定在舊帳本 A 的金額上。

---

### 根因二：Keep-Alive 機制下非活動分頁處於 `display: none`，導致瀏覽器凍結 `requestAnimationFrame`

1. **分頁元件未重新掛載（No Remount Trigger）**：
   - 在 `AppLayout.tsx` 中，`Dashboard`、`Accounts`、`Budgets`、`Contacts` 等分頁採用持久化保活棧（`display: none / block`），切換帳本時並不會觸發組件卸載與重新掛載。
2. **動畫被瀏覽器休眠**：
   - 當使用者在當前分頁（如 `Dashboard`）切換帳本時，背景處於 `display: none` 的其他分頁（如 `Accounts`、`Contacts`）接收到新資料時觸發了數值變更，發起 `requestAnimationFrame`。
   - 現代瀏覽器對於 `display: none` 的元素會徹底凍結或丟棄 RAF 幀更新。
   - 當使用者切換至該分頁時，動畫狀態未曾完整執行收斂，停留在舊狀態或快取狀態。

---

### 根因三：切換帳本動作未清理全域數值快取，缺乏原子重置

- 在 `useAppStore` 中執行 `setActiveLedgerId` 時，僅單純更新 `activeLedgerId` 字串，從未調用 `clearNumberMemory()`，亦未通知既有已掛載的組件重設其動畫參考值（Refs），導致舊帳本的數值記憶體在整個 SPA 運行期間持續殘留。
