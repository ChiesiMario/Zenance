# Root Cause 診斷報告：首頁切換月份統計資訊未更新及全站同類缺陷排查

## 1. 故障現象描述 (Phenomenon)

使用者在首頁（Dashboard）點擊月份切換箭頭（上一月／下一月）切換時間維度時，頂部核心統計卡片（淨結餘、收入、支出）的數值完全沒有更新，依然固定顯示為原月份的金額。
同時，要求對全站所有包含統計資訊與日期維度篩選的模組進行全面排查。

---

## 2. 核心代碼定位 (Code Location)

### 關鍵檔案 1：`src/pages/Dashboard.tsx`（第 400～454 行）
```tsx
// 缺陷點：memoryKey 寫死為全域靜態字串，未包含月份維度 (currentMonthPrefix)
<MagnitudeBadge amount={balance} memoryKey="dashboard-net-balance" />
<AmountDisplay amount={balance} memoryKey="dashboard-net-balance" />

<MagnitudeBadge amount={income} memoryKey="dashboard-income" />
<AmountDisplay amount={income} memoryKey="dashboard-income" />

<MagnitudeBadge amount={expense} memoryKey="dashboard-expense" />
<AmountDisplay amount={expense} memoryKey="dashboard-expense" />
```

### 關鍵檔案 2：`src/components/ui/AmountDisplay.tsx`（第 44～51 行）
```typescript
// 缺陷點：將真實合法的 0 金額誤判為非同步載入中的「Pending 態」，強制覆寫為快取舊值
const remembered = effectiveMemoryKey ? getRememberedNumber(effectiveMemoryKey) : undefined;
const isPendingZero = amount === 0 && remembered !== undefined && remembered !== 0;
const displayAmount = isPendingZero ? remembered : amount;

if (effectiveMemoryKey && amount !== 0) {
  setRememberedNumber(effectiveMemoryKey, amount);
}
```

### 關鍵檔案 3：`src/components/ui/SpringNumber.tsx`（第 91～98 行）
```typescript
// 缺陷點：當 value === 0 時直接 return 阻斷渲染更新，物理動畫拒絕降至 0
if (value === 0 && rememberedValue !== undefined && rememberedValue !== 0) {
  return;
}

if (scopedMemoryKey && value !== 0) {
  setRememberedNumber(scopedMemoryKey, value);
}
```

### 關鍵檔案 4：`src/components/ui/MagnitudeBadge.tsx`（第 32～38 行）
```typescript
// 缺陷點：將 amount === 0 歸類為 isInvalid 並強制回退至 remembered 快取
const isInvalid = amount === undefined || amount === null || isNaN(amount) || amount === 0;
const remembered = scopedMemoryKey ? getRememberedNumber(scopedMemoryKey) : undefined;
const effectiveAmount = isInvalid && remembered !== undefined ? remembered : amount;
```

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：首頁統計組件綁定了跨月份共享的靜態 `memoryKey`
1. 為了防範頁面切換或重新掛載時數字從 0 彈跳，系統引入了 `numberMemory` 機制。
2. 然而在 `Dashboard.tsx` 中，傳入 `AmountDisplay`、`SpringNumber` 與 `MagnitudeBadge` 的鍵名被硬編碼為靜態字串：
   - `"dashboard-net-balance"`
   - `"dashboard-income"`
   - `"dashboard-expense"`
3. 這些 Key 完全未附帶當前選定月份的標識（如 `currentMonthPrefix` 即 `2026-10`）。無論使用者如何切換月份，組件始終指向同一個全域記憶體槽位。

### 根本原因 B：底層數值組件將「合法 0 態」錯誤判定為「非同步載入待定態 (Pending Zero)」
1. 當使用者從有記帳的月份切換到一個**尚無記帳或某項收支恰好為 0 的月份**時，資料庫如實查詢返回空數據，上層計算得出的真實金額確實為 `0`。
2. 但底層三處組件（`AmountDisplay`、`SpringNumber`、`MagnitudeBadge`）的判定邏輯存在嚴重漏洞：
   - 只要 `amount === 0` 且快取中存在上一月份的非 0 記憶值，代碼就主觀認定「此時資料庫尚未返回數據，為防止 0 態閃爍，強行沿用快取中的舊數值」。
   - `SpringNumber` 在 `value === 0` 時甚至直接 `return`，拒絕觸發任何數值更新。
   - `MagnitudeBadge` 更將 `amount === 0` 直接判定為 `isInvalid`，強行保留上一月份的大額微膠囊。
3. **連鎖反應**：
   當使用者切換月份至空月份或收支為 0 的月份時，這三處防抖邏輯同時生效，將真實的 0 徹底吞噬，死死鎖定在舊月份的數值上，導致使用者視覺上「統計資訊完全沒有更新」。

---

## 4. 全站同類缺陷排查清單 (Full-Workspace Audit)

經對全站代碼進行全面語意搜尋與邏輯審查，發現以下模組存在完全相同的架構性缺陷：

### 1. 報表頁面 (`src/pages/Reports.tsx`，第 567、583、596、603、642、690、697、741 行)
- **現象**：在報表頁面切換時間跨度（週、月、季、年）或切換前後週期時：
  - `memoryKey="reports-net-balance"`
  - `memoryKey="reports-total-expense"`
  - `memoryKey="reports-total-income"`
  - `memoryKey="reports-peak-expense"`
  - `memoryKey="reports-peak-income"`
- **缺陷**：這些 Key 同樣為全靜態字串，未帶上週期區間鍵（如 `periodKey` 或日期字串）。當切換至無交易的區間時，同樣會被舊週期的非 0 數據鎖死。

### 2. 帳戶詳情頁 (`src/pages/AccountDetails.tsx`，第 315、323、331、340 行)
- `memoryKey={`account-income-${id}`}` 與 `memoryKey={`account-expense-${id}`}`
- 若某個帳戶的總收入或總支出為 0（但曾有記憶值），同樣會遭遇無法歸零展示的問題。

### 3. 聯絡人總覽與詳情頁 (`src/pages/Contacts.tsx` 與 `src/pages/ContactDetails.tsx`)
- 包含 `contacts-net-balance`、`contacts-total-receivable`、`contacts-total-payable`。
- 當所有債務或應收款全部結清歸零時，因 `amount === 0` 的攔截邏輯，卡片與徽章同樣無法正常歸零。
