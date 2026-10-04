# Root Cause 診斷報告：報表頁面總支出、總收入、單筆最高面對超長金額嚴重溢出 UI

## 1. 故障現象描述

在財務報表（`Reports.tsx`）的 KPI 指標總覽區塊中，當帳本中存在超長天文數字金額（例如數百億至萬億級別金額）時，下方的三欄分析卡片（總支出、總收入、單筆最高）出現嚴重排版崩潰：
1. **總支出（左欄）**：
   - 24px 主金額數字字串向右無限延伸，直接穿透中欄分隔線，與「總收入」的文字及金額相互重疊、疊印成一團黑色亂碼；
   - 次級文字「日均支出」的金額字串同樣向右橫跨穿透至中間欄位。
2. **總收入（中欄）**：
   - 主金額遭到左欄溢出文字覆蓋；
   - 次級文字「結餘率」在極端負值情況下計算出的超長百分比字串（如 `-1101101001.1%`）同樣溢出邊界。
3. **單筆最高（右欄）**：
   - 在左、中兩欄被內部內容大幅撐大變形後，右欄受到極限擠壓或截斷失真。

---

## 2. 核心代碼定位

檔案：`src/pages/Reports.tsx`（第 534～622 行）

```tsx
{/* 3-Column Analytical Indicators Grid */}
<div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border bg-card">
  {/* Indicator 1: Total Expense & Daily Avg */}
  <div className="p-4 flex flex-col justify-between gap-2">
    <div className="flex items-center justify-between h-5">
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none">
        <TrendingDown className="size-3.5 text-muted-foreground" />
        <span>{t('reports.totalExpense')}</span>
      </span>
      <MagnitudeBadge amount={totalExpense} memoryKey="reports-total-expense" />
    </div>
    <div>
      <p className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none">
        {currencySymbol}
        <SpringNumber value={totalExpense} memoryKey="reports-total-expense" />
      </p>
      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
        {t('reports.dailyAverage', '日均支出')}: {currencySymbol}
        {dailyAverage.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        })}
      </p>
    </div>
  </div>

  {/* Indicator 2: Total Income & Savings Rate */}
  <div className="p-4 flex flex-col justify-between gap-2">
    <div className="flex items-center justify-between h-5">
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5 leading-none">
        <TrendingUp className="size-3.5 text-emerald-500" />
        <span>{t('reports.totalIncome', '總收入')}</span>
      </span>
      <MagnitudeBadge amount={totalIncome} memoryKey="reports-total-income" />
    </div>
    <div>
      <p className="text-2xl font-mono tracking-tight font-medium text-foreground leading-none">
        {currencySymbol}
        <SpringNumber value={totalIncome} memoryKey="reports-total-income" />
      </p>
      <p className="text-[11px] font-mono mt-0.5">
        {savingsRate !== null ? (
          <span
            className={cn(
              'font-medium',
              savingsRate >= 0 ? 'text-emerald-500' : 'text-destructive'
            )}
          >
            {t('reports.savingsRate', '結餘率')}: {savingsRate >= 0 ? '+' : ''}
            {savingsRate.toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground">{t('reports.savingsRate', '結餘率')}: --</span>
        )}
      </p>
    </div>
  </div>

  {/* Indicator 3: Peak Single Expense */}
  <div className="p-4 flex flex-col justify-between gap-2">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono inline-flex items-center gap-1.5">
        <Flame className="size-3.5 text-amber-500" />
        <span>{t('reports.peakExpense', '單筆最高')}</span>
      </span>
    </div>
    <div>
      {peakExpenseTx ? (
        <>
          <p className="text-2xl font-mono tracking-tight font-medium text-foreground truncate select-text">
            {currencySymbol}
            {formatAmountNumber(peakExpenseTx.amount)}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5 select-text">
            {peakExpenseTx.note ||
              allCategories?.find(c => c.id === peakExpenseTx.category)?.name ||
              t('common.unknown', '未分類')}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-mono tracking-tight font-medium text-muted-foreground">
            --
          </p>
          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">--</p>
        </>
      )}
    </div>
  </div>
</div>
```

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因一：CSS Grid 網格項目預設 `min-width: auto` 陷阱，容器無法限制寬度
1. 在 W3C CSS Grid 佈局規範中，定義為 `grid grid-cols-1 sm:grid-cols-3` 的網格容器，其直接子項目（Grid Items）的 `min-width` 預設值為 `auto`（而非 `0`）。
2. 當子項目內部包含無空格、不可換行的連續字元（如包含千分位的等寬長數字串 `11,000,000,000,000,000`）時，瀏覽器會將該項目的最小寬度計算為「內容的最小內在寬度（`min-content width`）」，從而強制突破 `1fr`（或 33.333%）的欄位限制。
3. 三個 Indicator 的外層容器 `<div className="p-4 flex flex-col justify-between gap-2">` 全數缺失 `min-w-0`（`min-width: 0`）與 `overflow-hidden`，導致寬度約束徹底崩解。

---

### 根因二：總支出與總收入的主金額完全缺失溢出防護與跑馬燈機制
1. 在 `Dashboard.tsx` 與 `Accounts.tsx` 等其他主頁面中，指標金額均統一封裝在 `<AutoMarquee align="left">` 與具備金融縮寫切換能力的 `<AmountDisplay>` 內。
2. 而在 `Reports.tsx` 中，總支出與總收入的主金額直接採用純文字 `<p className="text-2xl font-mono ...">` 裸奔渲染：
   ```tsx
   {currencySymbol}
   <SpringNumber value={totalExpense} memoryKey="reports-total-expense" />
   ```
3. 該標籤未設置 `truncate`、未設置 `AutoMarquee`，且未配置寬度上限；瀏覽器對數字串預設不執行斷詞換行（`word-break: normal`），文字直接橫向衝破邊界，疊加至右側欄位。

---

### 根因三：次級指標文字（日均支出與結餘率）無寬度防護與截斷控制
1. **日均支出**：
   直接使用 `dailyAverage.toLocaleString(...)` 渲染未受限制的長字串，在總支出巨大時該數值亦達到萬億級，整行文字在下方無阻礙地跨欄穿透。
2. **結餘率**：
   在極端負結餘（支出遠大於收入）場景下，計算出的百分比字串極長（如 `-1101101001.1%`），同樣為純文字輸出，缺乏截斷或字串防護。

---

### 根因四：單筆最高卡片 `truncate` 在無約束的父容器層級下失效
1. 雖然第三欄「單筆最高」在 `<p>` 上配置了 `truncate`（`overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`），但 CSS 規範要求 `text-overflow: ellipsis` 必須在具有明確受限寬度（如父層設置 `min-w-0` 或固定尺寸）的 Flex/Grid 結構中才能生效。
2. 由於外層 Grid Item 與中介 Flex 容器均為 `min-w: auto`，截斷機制在彈性佈局計算中失效，且受前兩欄過度擴張擠壓，整體排版發生扭曲。
