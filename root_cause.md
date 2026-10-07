# Root Cause 診斷報告：首次切換頁面金額瞬間從 0 變為實際金額問題排查

## 1. 故障現象描述 (Phenomenon)

- **現象**：當使用者在應用程式中「首次切換」至某一頁面（如從首頁切換至預算頁、帳戶頁、聯絡人頁或報表頁）時，頂部核心統計卡片或金額顯示欄位在第 0 幀會瞬間顯示為 `¥0`，隨後在約 10～50ms 內閃跳變更為真實計算金額（例如 `¥0` -> `¥128,450.00`）。
- **對比**：一旦該頁面曾被訪問過，後續在分頁之間來回切換時，金額始終精確保持為真實數值，完全不會再次出現從 0 閃跳的現象。

---

## 2. 核心代碼定位 (Code Location)

### 關鍵檔案 1：`src/components/layout/AppLayout.tsx`（第 268～288 行）
```tsx
{/* 延遲掛載 (Lazy Mount) + 常駐保活 (Keep-Alive) 機制 */}
{mountedTabs.has('/') && (
  <div style={{ display: location.pathname === '/' ? 'block' : 'none' }}>
    <Dashboard />
  </div>
)}
{mountedTabs.has('/budgets') && (
  <div style={{ display: location.pathname === '/budgets' ? 'block' : 'none' }}>
    <Budgets />
  </div>
)}
{mountedTabs.has('/accounts') && (
  <div style={{ display: location.pathname === '/accounts' ? 'block' : 'none' }}>
    <Accounts />
  </div>
)}
{mountedTabs.has('/contacts') && (
  <div style={{ display: location.pathname === '/contacts' ? 'block' : 'none' }}>
    <Contacts />
  </div>
)}
```

### 關鍵檔案 2：`src/hooks/useMonthTransactions.ts` / `useTransactions.ts` / `useAccounts.ts`
```typescript
// Dexie useLiveQuery 的非同步特性
const transactions = useLiveQuery(
  async () => {
    if (!activeLedgerId || !yearMonth) return [] as Transaction[];
    return await queryMonthTransactions(activeLedgerId, yearMonth);
  },
  [activeLedgerId, yearMonth]
);

// 初次掛載第 0 幀：transactions 必定為 undefined
return {
  transactions,
  isLoading: transactions === undefined,
};
```

### 關鍵檔案 3：業務頁面金額統計計算邏輯（以 `src/pages/Dashboard.tsx` 為例）
```typescript
const { transactions: monthTransactions } = useMonthTransactions(currentMonthPrefix);
// 缺陷點：當 monthTransactions 處於 undefined 載入待定態時，直接降級為空陣列 []
const filteredTransactions = monthTransactions || [];

const { income, expense, balance } = useMemo(() => {
  let inc = 0;
  let exp = 0;
  filteredTransactions.forEach(t => { ... });
  // 空陣列自然結算出 inc = 0, exp = 0, balance = 0
  return { income: inc, expense: exp, balance: inc - exp };
}, [filteredTransactions]);
```

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：Dexie `useLiveQuery` 底層 IndexedDB 非同步查詢的「初始空幀 (Initial Void Frame)」
1. 本專案採用純客戶端 IndexedDB（基於 Dexie.js 封裝）進行全本地資料管理。
2. IndexedDB 的所有讀取事務均為原生非同步（Promise / IDBRequest）。
3. 當任何組件初次掛載（Mount）調用 `useLiveQuery` 時，JavaScript 在第 0 幀同步執行期間無法取得尚未 Resolve 的資料庫結果，因此 `useLiveQuery` 的初始返回值必定為 `undefined`。
4. 上層業務組件（如 `Dashboard`、`Accounts`、`Contacts`、`Reports`）普遍採用 `transactions || []` 的容錯寫法，將「資料尚在讀取中的 Pending 態」等同視為「數據為空的 Resolved 態」，導致第 0 幀計算出的金額嚴格為數字 `0`。
5. 約 10～50 毫秒後，IndexedDB 讀取完畢並觸發 React 狀態更新（Re-render），金額瞬間替換為真實數值，造成肉眼可見的「0 -> 實際金額」跳變。

### 根本原因 B：`AppLayout` 的「延遲掛載 (Lazy Mount) + 常駐保活 (Keep-Alive)」時序差異
1. `AppLayout.tsx` 為了節省初次開啟 App 時的 CPU 與記憶體開銷，對底部導覽的一級 Tab 採用了延遲掛載策略（`mountedTabs.has(path)`）。
2. **首次切換頁面時**：
   - 目標頁面此前從未掛載過，點擊 Tab 後觸發該頁面組件的首次 Mount。
   - 首次 Mount 必然經歷「第 0 幀 IndexedDB 查詢 pending (`undefined` -> `0`)」至「第 1 幀查詢完成（真實數值）」的過程，因此出現跳變。
3. **之後切換該頁面時**：
   - 由於該頁面已被保留在 `mountedTabs` 集合中，後續切換僅是切換外層容器的 CSS `display: block / none`。
   - 組件內部的記憶體狀態與 Dexie 查詢結果依然保活，未被銷毀或重新掛載，直接原樣呈現上次的真實數值，因此完全沒有跳變。

---

## 4. 結論

本現象是由於「**IndexedDB 非同步讀取在組件首次掛載時產生短暫的 Pending 空幀（`undefined`），被業務邏輯預設歸零計算**」與「**`AppLayout` 延遲掛載保活機制**」相互疊加形成的生命週期時序問題。
