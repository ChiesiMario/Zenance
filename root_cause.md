# Root Cause 診斷報告：交易詳情卡片「上下滑動卡片觸發滑動背後頁面（滾動穿透）」問題排查

## 1. 現象分析 (Phenomenon)
在交易詳情卡片頁面（`TransactionDetailsDialog`）打開時，用戶在卡片上進行上下滑動（無論是試圖切換退款卡片、查看卡片內容，或是無意識的滑動），非常容易直接帶動卡片背後的首頁/主頁面（交易列表）進行上下滾動。

---

## 2. 核心代碼定位 (Code Location)

- **檔案 1**：[`src/components/transactions/TransactionDetailsDialog.tsx`](file:///d:/GitHub/Zenance/src/components/transactions/TransactionDetailsDialog.tsx)
  - **位置 A：舞台與畫布容器缺乏手勢行為聲明與 touchmove 攔截（第 1230～1245 行）**：
    ```tsx
    {/* Scrollable / Centered 2D Stage */}
    <div
      ref={stageRef}
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto select-none"
      onWheel={handleWheel}
      onClick={onClose}
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        ...
    ```
    - 舞台與畫布容器覆蓋了全螢幕並宣告了 `pointer-events-auto`。
    - **完全未設置 CSS `touch-action: none`**。
    - 僅監聽了 `onTouchStart` 與 `onTouchEnd`，**完全沒有監聽 `onTouchMove`**，亦未在滑動過程中呼叫 `e.preventDefault()` 阻止原生垂直滾動行為。
  - **位置 B：卡片非滾動區域手勢冒泡（第 923～970 行、第 1073～1076 行）**：
    - 卡片上半部（Header、標籤、大金額等）為固定非滾動區域（`shrink-0`）。
    - 下方明細區域僅在 `onTouchStart` 上調用了 `e.stopPropagation()`，但實際的手勢位移發生在 `touchmove` 階段。當用戶在卡片上半部滑動，或在明細區域滾動抵達頂部/底部時，手勢將無阻礙向外傳播。

- **檔案 2**：[`src/components/layout/AppLayout.tsx`](file:///d:/GitHub/Zenance/src/components/layout/AppLayout.tsx)（第 289～293 行）
  ```tsx
  {/* Main Content Area with Keep-Alive View Stack */}
  <main 
    ref={mainRef} 
    onScroll={handleScroll}
    className="flex-1 w-full max-w-xl mx-auto overflow-y-auto px-5 ... pb-6"
  >
  ```
  - 專案架構規範採用樹狀 100% 高度，頁面的主要滾動主體為 `<main>` 容器，而非標準網頁的 `document.body`。
  - 當全螢幕彈窗開啟時，背景的 `<main>` 容器未進行任何滾動鎖定（Scroll Lock），仍處於實時可滾動狀態。

---

## 3. 底層原因剖析 (Root Cause)

1. **手勢事件缺乏消費與 CSS `touch-action` 缺失 (Unconsumed Touch Gestures)**：
   `TransactionDetailsDialog` 內部實現了上下滑動切換卡片的自定義業務邏輯，但該邏輯僅在 `onTouchEnd` 時計算位移距離，在滑動過程中的 `touchmove` 階段完全沒有攔截或調用 `preventDefault()`。同時，舞台容器未宣告 `touch-action: none`。瀏覽器判定該垂直手勢為「未被消費的原生滾動」，因此觸發原生手勢傳遞。

2. **瀏覽器滾動鏈 (Scroll Chaining) 穿透機制**：
   在移動端 WebKit（iOS Safari / PWA）及 Chromium 內核中，當觸摸事件發生在一個自身不具備原生滾動能力（`overflow: hidden`）的元素上時，瀏覽器會沿著 DOM 樹向上尋找最近的可滾動父級容器，並將該滾動手勢直接轉交給它處理。

3. **專案架構下的背景滾動容器（`<main>`）未被鎖定**：
   一般 UI 彈窗庫（如 `@base-ui/react`）通常僅鎖定 `document.body` 的 `overflow: hidden`；然而 Zenance 遵循全平台通用設計規範，內部可滾動視圖由 `<main className="flex-1 overflow-y-auto">` 獨立接管。在彈窗開啟期間，`<main>` 始終保持可滾動狀態，使得穿透的手勢毫無阻礙地滾動了背後的主頁面。
