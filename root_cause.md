# Root Cause 診斷報告：手機端多數頁面（如預算頁面返回首頁）缺乏左滑返回手勢

## 1. 現象與需求分析 (Phenomenon)

使用者指出在手機端使用 Zenance 時，許多頁面（例如從預算頁面 `/budgets` 切換後返回首頁 `/`，以及各項二級詳情頁面）缺乏「左滑返回」（螢幕左側邊緣向右滑動返回，Edge Swipe-Back）的手勢支援。

---

## 2. 核心代碼與架構定位 (Code & Architecture Location)

### 關鍵檔案 1：`src/components/layout/AppLayout.tsx`
- **負責職責**：全站主容器、底部導覽列（Bottom Navigation）、Keep-Alive 視圖快取機制。
- **現狀**：
  - 核心 `<main>` 容器與根 `<div>` 未掛載任何觸控手勢監聽器（無 `onTouchStart`、`onTouchMove`、`onTouchEnd`）。
  - 一級 Tab（`/`、`/budgets`、`/accounts`、`/contacts`）使用 `style={{ display: location.pathname === ... ? 'block' : 'none' }}` 做顯示切換，未具備頁面層級的手勢返回觸發能力。

### 關鍵檔案 2：`src/AppRouter.tsx`
- **負責職責**：前端路由系統（`createBrowserRouter`）。
- **現狀**：一級頁面與二級子路由（如 `/budgets/:id`、`/accounts/:id`、`/settings`）各自獨立渲染，但全域未包裝任何「滑動返回導航控制器（Swipe Navigation Provider）」。

### 關鍵檔案 3：`src/components/transactions/AddTransactionModal.tsx`
- **負責職責**：新增交易 Command Deck 彈窗。
- **現狀**：先前實裝的邊緣滑動手勢僅作為局部邏輯綁定於該 Modal 的 `DialogContent` 節點上，無法泛化或傳播至全域路由與其他頁面。

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：PWA Standalone 模式對瀏覽器原生邊緣手勢的截斷
1. Zenance 在 `manifest.webmanifest` 中配置為 `display: "standalone"`（標準 PWA 模式）。
2. 在 iOS Safari（「加入主畫面」後）及 Android WebAPK 環境中，一旦進入 Standalone 全螢幕模式，作業系統與瀏覽器內核會**徹底關閉原生視窗的邊緣滑動返回手勢（Native Navigation Gesture Disabled）**。
3. 在一般的 Safari 標籤頁中，從左向右滑動依賴於瀏覽器原生歷史堆疊；但在 Standalone PWA 模式下，**必須由 Web 應用層 JavaScript 主動捕獲 Touch 事件並調用路由導航**，否則使用者滑動螢幕邊緣不會產生任何效果。

### 根本原因 B：手勢監聽僅為單點局部實裝，缺乏全域佈局層的手勢監聽架構
1. 先前實裝的 `Edge Swipe-Back` 邏輯僅注入於 `AddTransactionModal` 彈窗內部，作用範圍僅限於該全螢幕彈窗自身。
2. 主應用層骨架 `AppLayout.tsx` 的全域視窗與 `<main>` 滾動容器完全未註冊 Touch 事件監聽，導致全站常規頁面（無論是一級 Tab 還是二級 Outlet 頁面）皆處於「手勢盲區」。

### 根本原因 C：一級 Tab 導航語意與使用者人機直覺的落差
1. 在傳統前端 SPA 架構中，底部導覽列（首頁、預算、帳戶、聯絡人）通常被視為「平行 Tab」，而非層級式的「父子頁面（Master-Detail Stack）」。
2. 但在行動端實際使用體驗中，使用者經常是「從首頁出發，點擊預算頁面查看」，心理模型上將首頁視為起點（Origin），自然期望能夠透過「邊緣向右滑動」返回首頁。
3. 目前 `AppLayout` 僅在點擊 Tab 按鈕時觸發 `navigate(item.path)`，並未在路由或視圖堆疊中建立「非首頁一級 Tab 左滑快速返回首頁」的導航映射。

### 根本原因 D：次級路由頁面（Sub-routes）缺乏統一的手勢導航封裝
1. 次級頁面（如 `BudgetDetails`、`AccountDetails`、`Settings` 等）雖然在 UI 左上方均設有返回按鈕（`<ChevronLeft />`）並調用 `navigate(-1)`，但這些頁面本體同樣未掛載 Touch 監聽。
2. 缺乏一個全域性或佈局級別的手勢包裝器，導致每個二級頁面目前都僅能透過手指精準點擊左上角的小按鈕進行返回。
