# Root Cause 診斷報告：Dialog 內容滾動穿透至背景頁面

## 1. 問題現象描述
當使用者在移動端（或觸控裝置）開啟 Dialog 彈窗並上下滑動中間內容區時，會出現「Dialog 內容未被滾動，反而是背景頁面在上下滑動」或「Dialog 滾動至邊緣時帶動背景頁面連鎖滾動」的現象（即前端領域典型的**滾動穿透 / Scroll Chaining / Body Scroll Leak**）。

---

## 2. 核心代碼定位
1. **背景頁面滾動架構宿主**：
   - 檔案：`src/components/layout/AppLayout.tsx`
   - 位置：第 206～210 行之 `<main ref={mainRef} className="flex-1 w-full max-w-xl mx-auto overflow-y-auto ...">`
2. **Dialog 底層滾動鎖定機制**：
   - 套件：`@base-ui/react/dialog` 內部之 `useScrollLock` 鉤子
   - 行為：僅對 `document.documentElement` 或 `document.body` 進行 `overflow: hidden` 設置。
3. **彈窗滾動邊界與手勢控制**：
   - 檔案：`src/components/ui/dialog.tsx`
   - 位置：第 93～105 行之 `DialogPrimitive.Popup` 及子內容選擇器樣式。

---

## 3. 底層機制與根本原因剖析 (Root Cause)

### 原因一：Base UI 預設 Scroll Lock 機制與 App Shell 架構產生脫節（核心主因）
- **架構特徵**：本專案嚴格遵循跨端 Web 規範，`html`、`body` 與 `#root` 均設定了 `height: 100% / 100dvh; overflow: hidden;`，頁面的主要內容滾動完全由 `<main className="flex-1 overflow-y-auto">` 接管。
- **機制失效**：`@base-ui/react` 的彈窗在開啟時，內建的 `useScrollLock` 僅會將 `body.style.overflow` 設為 `hidden`。但由於實際產生滾動的並非 `body`，而是內部的 `<main>` 容器，因此背景的 `<main>` 在 Dialog 開啟期間始終保持 `overflow-y-auto` 且未受任何拘束，仍隨時具備滾動響應能力。

### 原因二：缺少滾動鏈接隔離（Scroll Chaining 未被阻斷）
- **CSS 規範行為**：在現代瀏覽器（特別是 iOS WebKit 與 Android Chromium）中，當某個滾動容器滑動至邊界（頂部 `scrollTop === 0` 或底部最大高度）時，若未宣告 `overscroll-behavior: contain`（或 Tailwind 的 `overscroll-contain`），瀏覽器預設會觸發 **Scroll Chaining（滾動鏈接）**。
- **現象鏈條**：Dialog 內的動態表單區塊未配置 `overscroll-contain`，當手指向上/向下滑動到端點、或初始滑動未精確命中內容文字時，滾動手勢會沿著 DOM 樹向上冒泡至最近的可滾動視窗容器——即背景尚未被鎖定的 `<main>` 元素，導致背景頁面被滑動。

### 原因三：觸控目標判定與邊界穿透
- Dialog 彈窗外層為了彈性居中採用了 `pointer-events-none` 容器（第 93 行），而底層遮罩未設置觸控動作攔截（如 `touch-action: none`）。在手指觸控操作時，若觸摸點落在彈窗外邊界、邊距縫隙或慣性滑出卡片區域，觸控手勢會直接判定並作用於背景可見且具備滾動特性的 `<main>` 元素。
