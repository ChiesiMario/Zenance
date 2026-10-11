# Root Cause 分析報告：交易詳情頁點擊膠囊跳轉詳情頁過程動畫不順暢

## 1. 現象描述
在交易詳情頁（憑證卡片彈窗 `TransactionDetailsDialog`）中，用戶點擊頂部「分類一欄」（包括分類、轉帳帳戶、往來對象）或下方的「標籤膠囊」跳轉到對應詳情頁時，跳轉過程缺乏流暢的原生過渡感，出現視覺閃爍、卡頓與畫面生硬切換的現象。

---

## 2. 根本原因定位 (Root Cause)

### 根本原因一：彈窗組件被直接粗暴銷毀，缺乏退場動畫（Instant Dialog Unmounting Flash）
- 在 [src/components/transactions/TransactionDetailsDialog.tsx](file:///d:/GitHub/Zenance/src/components/transactions/TransactionDetailsDialog.tsx) 的點擊處理邏輯中：
  ```tsx
  onClick={(e) => {
    e.stopPropagation();
    onClose();
    navigate(`/settings/tags/${tag.id}`);
  }}
  ```
- 父層組件（如 [src/components/transactions/GroupedTransactionList.tsx](file:///d:/GitHub/Zenance/src/components/transactions/GroupedTransactionList.tsx#L1129-L1134) 與 [src/components/layout/AppLayout.tsx](file:///d:/GitHub/Zenance/src/components/layout/AppLayout.tsx#L462-L465)）採用條件掛載模式：
  ```tsx
  {!onTransactionClick && selectedTransactionId && (
    <TransactionDetailsDialog
      transactionId={selectedTransactionId}
      onClose={() => setSelectedTransactionId(null)}
    />
  )}
  ```
- 當點擊膠囊觸發 `onClose()` 時，父層的 `selectedTransactionId` / `viewingTransactionId` 在第 0 毫秒立即變為 `null`，React 在同一個微任務中**直接將整棵 `TransactionDetailsDialog` DOM 樹硬生生從頁面上銷毀卸載（Unmount）**。
- 這導致 Base UI Dialog 的毛玻璃遮罩（Backdrop）和全螢幕彈窗容器**完全沒有經歷任何退出動畫或淡出過渡**，暗色毛玻璃在瞬間突然蒸發，造成強烈的「被直接拔掉」的視覺閃斷感。

---

### 根本原因二：彈窗銷毀、微任務重排與路由載入在同幀碰撞引發主執行緒卡頓（Main-Thread Long Task Collision）
- 點擊回調中，`onClose()` 與 `navigate(...)` 是同步串聯調用的。
- 瀏覽器在同一個 Event Loop 幀中同時被迫處理多重重負載任務：
  1. **舊彈窗深度卸載**：銷毀掛載於 `document.body` 的 Base UI Portal、多張憑證 DOM 樹以及釋放 body 滾動鎖定（`overflow: hidden` 與 padding 補償）。
  2. **視圖重排**：Base UI 清理 body 滾動條樣式時觸發整頁的**強制同步重排（Forced Synchronous Reflow）**。
  3. **新路由掛載與重型查詢**：React Router 切換當前路由，掛載目標詳情頁（如 `TagDetails`、`CategoryDetails`、`AccountDetails`、`ContactDetails`）。新頁面掛載時立即執行 Dexie 資料庫查詢訂閱、重新計算聚合數據，並同步渲染整組 `GroupedTransactionList` 大量交易 DOM 節點。
- 這些高耗時任務全部擠在同一個渲染幀中執行，造成主執行緒耗時超過 50ms（Long Task），直接引發掉幀（Dropped Frames）與停頓。

---

### 根本原因三：三段式視覺突兀閃跳（Triple Visual Flash）
- 由於彈窗直接瞬間消失、而新路由頁面需要執行渲染，在微觀時間軸上形成了三段式脫節：
  1. **第一階段（T=0ms）**：點擊膠囊，暗色毛玻璃遮罩和彈窗卡片瞬間消失；
  2. **第二階段（T=16ms）**：新頁面尚未完成佈局，底層的原頁面（例如首頁 Dashboard）毫無遮擋地裸露出來一瞬間（Flash of Previous Page）；
  3. **第三階段（T=30~60ms）**：React Router 完成目標詳情頁掛載，新頁面突然覆蓋上來，標頭與交易清單再次刷新閃現。
- 用戶肉眼所感知的「不順暢、不絲滑」，本質上就是這三段視覺狀態在毫秒級別內的突兀閃跳，缺乏連貫的頁面轉場過渡。
