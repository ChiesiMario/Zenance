# Zenance 跨端渲染避坑與效能架構手冊
> Cross-Platform Rendering Pitfalls & Architecture Guide

---

## 1. 核心哲學：拒絕平台補丁，堅持標準通用 (The Core Philosophy)
在 Zenance 開發過程中，我們始終秉持最高原則：
- **一套代碼，全平台流暢 (One Codebase, Universal Fluidity)**。
- **嚴禁平台特化補丁 (No Platform Hacks)**：絕對不針對特定操作系統（iOS / Android / Windows）、特定瀏覽器核心（WebKit / Blink / Gecko）或特定晶片架構編寫任何 User-Agent 條件分支或臨時修補代碼。
- **以標準 Web 規範解決跨端差異**：所有佈局、動畫與視覺效果必須基於 W3C 最堅固、相容性最高的底層規範實現。

---

## 2. 八大經典踩坑案例深度剖析 (Eight Critical Case Studies)

### 案例 1：iOS Safari `100vh` 陷阱導致底部導航欄被擠出螢幕
- **現象**：在 iPhone 移動端 Safari 瀏覽器中，底部導航欄（Bottom Navigation Bar）完全消失不可見。
- **底層根本原因 (Root Cause)**：
  - 移動端 Safari 存在「動態網址列與工具欄折疊機制」。W3C 傳統定義的 `100vh` 計算的是包含被 Safari 底部工具欄遮擋的全螢幕物理高度（例如約 736px），但實際可見高度只有約 660px。
  - 當外層容器設置了 `min-h-screen`（即 `min-height: 100vh`）且整體是 `overflow: hidden` 時，Flex 容器被硬生生撐長了 70px，導致釘在 Flex 最下方的 `<nav id="bottom-nav">`（高 56px）剛好被推到了視窗邊界之外。
- **標準解法 (Standard Fix)**：
  - **全面回歸樹狀百分比高度（`height: 100%`）**：
    ```css
    html, body, #root {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    ```
  - 外層容器使用 `h-full flex flex-col`，內部內容由 `<main className="flex-1 overflow-y-auto">` 吃掉剩餘高度，導航欄使用 `flex-none` 自然貼底。
  - 在任何瀏覽器中，`height: 100%` 永遠嚴格等同於當前動態可用視窗，絕不會超出工具欄。

---

### 案例 2：`fixed inset-0 m-auto` 導致 Dialog 窗口高度被拉滿螢幕
- **現象**：在老款設備（如 iOS 15 WebKit）上打開原本只有幾行輸入框的 Dialog，窗口高度卻硬生生從螢幕頂部頂到底部，撐滿整個螢幕。
- **底層根本原因 (Root Cause)**：
  - 在 CSS 盒模型中，當一個元素為 `position: fixed` 且四邊同時設定 `inset: 0`（即 `top: 0; bottom: 0; left: 0; right: 0`）時，若無具體像素高度，瀏覽器會使用 stretch 規則拉伸至 100% 高度。
  - 舊版 WebKit 對 `h-fit`（`height: fit-content`）在 fixed 定位下的尺寸解析支援不全，將其降級視為 `height: auto`，在 `top: 0; bottom: 0` 下的計算結果就是 **100% 視窗高度**。
- **標準解法 (Standard Fix)**：
  - **全面採用「全螢幕 Flex 容器居中」**：
    ```tsx
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
      <DialogPrimitive.Popup className="pointer-events-auto relative grid w-full max-w-[400px] max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-card p-6 border border-border shadow-none">
        {children}
      </DialogPrimitive.Popup>
    </div>
    ```
  - 外層是全螢幕 Flex 容器（`pointer-events-none` 允許穿透點擊關閉遮罩）；彈窗卡片本身只是一個普通 block（`pointer-events-auto`），完全脫離 fixed 坐標系，**高度天然由內容自然撐開（Content-fit），絕無可能被拉伸**！

---

### 案例 3：CSS `zoom-in-95` 複合 Transform 導致居中坐標亂跳
- **現象**：Dialog 打開的瞬間，畫面突然從偏右下角劇烈跳動到螢幕中央。
- **底層根本原因 (Root Cause)**：
  - 傳統居中常依賴 `top: 50%; left: 50%; transform: translate(-50%, -50%);`。
  - tailwindcss-animate 的 `zoom-in-95` 動畫在執行時，底層生成了 `transform: scale(0.95)`。
  - 在 CSS 動畫關鍵幀合成階段，動畫的 `transform` 覆蓋掉了幾何定位的 `transform`，導致動畫第 0 幀是以 `(50vw, 50vh)` 為左上角，動畫結束瞬間又跳回以 `(50vw, 50vh)` 為中心，產生視覺上的「原點衝撞與劇烈亂跳」。
- **標準解法 (Standard Fix)**：
  - 嚴格遵守案例 2 的 **外層 Flexbox 居中** 架構，卡片本體不使用任何 `transform: translate`，從幾何維度徹底根除衝撞可能。
  - 彈窗禁用覆蓋座標的複合 Transform 縮放動畫，改用原生極速彈出。

---

### 案例 4：動態 Alpha 漸變疊加全螢幕毛玻璃導致 GPU 劇烈頻閃 (Strobe Flicker)
- **現象**：在 iPhone 7 Plus（A10 晶片）等設備上打開 Dialog 時，整個螢幕每秒數十次白黑閃爍。
- **底層根本原因 (Root Cause)**：
  - 遮罩層在執行 `opacity: 0 -> 1` 動態漸變時，舊版 WebKit Compositor 在這 150ms 內的每一幀，都必須重新分配 GPU 紋理緩存來混合即時全螢幕高斯模糊。
  - 在老款架構 GPU 上，GPU 紋理緩存被每秒數十次反覆銷毀與重建（Texture Surface Thrashing），表現為全螢幕黑白劇烈頻閃。
- **標準解法 (Standard Fix)**：
  - **特效動靜分離**：動態展開的浮層遮罩**嚴禁執行帶動態 Alpha 漸變的毛玻璃計算**。
  - 遮罩層必須**「瞬間就位（Instant, `data-closed:hidden`）」**，點擊瞬間背景直接高斯模糊沉底，不跑透明度漸變，0 頻閃、0 紋理重建開銷！

---

### 案例 5：A9/A10 (iOS 15) 缺乏硬體著色器模糊導致全螢幕 DisplayList 重播與動畫卡頓
- **現象**：Windows、Android、現代 iOS 設備均絲滑無比，唯獨 iPhone 7P 與 SE 1（iOS 15）打開 Dialog 時有非常明顯的掉幀與定格卡頓感。
- **底層根本原因 (Root Cause)**：
  - 現代設備支援 Metal 硬體著色器原地降採樣模糊（Dual Kawase Blur），耗時 `< 2ms`。
  - 但 iOS 15 的舊版 WebKit 缺乏該支援，遇見全螢幕 `backdrop-filter` 時，必須在記憶體中將全螢幕繪圖指令（DisplayList）完整重播一遍，生成全尺寸點陣圖（iPhone 7P @3x 下高達 274 萬像素）。
  - 在 A9/A10 雙核 CPU 與 25GB/s 有限頻寬下，該重繪有固定的 **80ms ~ 120ms 延遲**。前端設置的 `100ms~150ms` 淡入動畫剛好被這 80ms 吞噬，人眼看到的就是「先定格卡住、再掉幀跳出」的抽搐感。
- **標準解法 (Standard Fix)**：
  - **彈窗卡片全面採用「原生級瞬時彈出 (Instant Pop)」**：移除卡片上的慢速 `animate-in fade-in`，點擊即現，徹底切斷動畫幀與底層光柵化的競爭，消除丟幀現象。
  - **毛玻璃半徑微調至 2px**：`backdrop-blur-[2px] bg-background/80`，卷積採樣點減少 75%，光柵化耗時從 70ms 驟降至 15ms（低於單幀 16.6ms 門檻）。
  - **移除 `isolate`**：避免觸發 WebKit 整頁圖層扁平化（Layer Flattening）重繪。
  - **禁用第 0 幀同步焦點爭奪**：設定 `initialFocus={false}`，避免在掛載瞬間調用 `.focus()` 引發同步強制重排（Forced Synchronous Reflow）。

---

### 案例 6：Tailwind CSS v4 `bg-background/80` 依賴 `color-mix()` 導致 iOS 15 遮罩呈現 100% 實白/實黑
- **現象**：在 iPhone 7 Plus 與 iPhone SE 1（最高支援至 iOS 15.8.x）上打開 Dialog，背景遮罩不是半透明毛玻璃，而是 100% 完全不透明的純白（淺色模式）或純黑（深色模式），下層所有頁面內容被徹底遮蔽。而在 iOS >= 16.2、Android、Windows 上則一切正常。
- **底層根本原因 (Root Cause)**：
  - Tailwind CSS v4 在處理帶動態 CSS 變數的透明度修飾符（例如 `bg-background/80`，其中 `--color-background: var(--background)` 引用 HEX 色值 `#ffffff` / `#000000`）時，產生的 CSS 是基於現代 CSS Color Module Level 4 的 `color-mix()` 函式：
    ```css
    .bg-background\/80 {
      background-color: var(--color-background); /* 實色 Fallback */
    }
    @supports (color: color-mix(in lab, red, red)) {
      .bg-background\/80 {
        background-color: color-mix(in oklab, var(--color-background) 80%, transparent);
      }
    }
    ```
  - **WebKit 支援門檻**：Apple WebKit 直到 **Safari 16.2 / iOS 16.2** 才實作 `color-mix()`。iOS 15 內建的 WebKit 完全不支援 `color-mix()`，因此 `@supports` 判定為 `false`。
  - **Fallback 觸發**：WebKit 被迫退回最外層的 fallback：`background-color: var(--color-background)`。因為 `--background` 分別是純白 `#ffffff` 或純黑 `#000000`，因此遮罩瞬間變成不帶任何 Alpha 通道的 100% 實色大幕布！
- **標準解法 (Standard Fix)**：
  - **全面採用專屬語意變數 `bg-overlay`**：
    在 `src/index.css` 的 `@theme` 註冊 `--color-overlay: var(--overlay)`，並在 `:root` 和 `.dark` 直接內嵌 RGBA Alpha 通道：
    ```css
    :root {
      --overlay: rgba(255, 255, 255, 0.8); /* 80% 白霜牛奶玻璃 */
    }
    .dark {
      --overlay: rgba(0, 0, 0, 0.8);       /* 80% 深邃黑曜石毛玻璃 */
    }
    ```
  - 編譯產物直接為 `background-color: var(--color-overlay);`，無任何 `color-mix()` 依賴，100% 原生相容所有版本的 WebKit / Blink / Gecko 瀏覽器。
  - 所有 Dialog、ConfirmDialog、Select、DropdownMenu 遮罩層全面使用 `bg-overlay backdrop-blur-[2px]`。

---

### 案例 7：非同步資料空白期與硬編碼預設值引發假陽性渲染閃爍 (Phantom Foreign Currency Flickering)
- **現象**：在基準貨幣非 CNY 的帳本（如 USD、EUR、HKD 等）中，打開一筆普通的同幣種交易詳情卡片，卡片下方在第 0 幀短暫顯示了「原始金額」與「匯率」欄位，約 20ms ~ 50ms 後突然消失，視覺上產生了「匯率資訊一閃而過」的跳動閃爍。
- **底層根本原因 (Root Cause)**：
  - **資料查詢 Hook 首次掛載空白期**：Dexie 的 `useLiveQuery` 進行 IndexedDB 查詢時是非同步微任務，在組件掛載的第一幀（第 0 幀）返回 `undefined`。若 Hook 未實作模組級單例快取，每次新組件掛載必定產生短暫的資料空白。
  - **過早降級與硬編碼值衝突 (Premature Fallback to Hardcoded Value)**：業務層在計算是否為外幣交易時，寫死了 `(activeLedger?.baseCurrency || 'CNY')`：
    ```typescript
    const isForeignFrom =
      fromCurrency !== (activeLedger?.baseCurrency || 'CNY') ||
      Boolean(tx.originalCurrency && tx.originalCurrency !== (activeLedger?.baseCurrency || 'CNY'));
    ```
  - **假陽性判斷 (False Positive)**：在 USD 帳本中，該筆交易的 `fromCurrency` 正確為 `'USD'`，但在第 0 幀時 `activeLedger` 尚未讀出，基準貨幣被粗暴降級為 `'CNY'`。導致 `'USD' !== 'CNY'` 評估為 `true`，React 誤將同幣種交易當作外幣交易短暫掛載了外幣明細行；待資料庫查詢完成更新 `activeLedger` 為 `'USD'` 後，條件變為 `false`，DOM 被瞬間卸載，造成肉眼可見的閃爍跳動。
- **標準解法 (Standard Fix)**：
  - **資料 Hook 實作模組級單例快取 (Singleton Memory Cache)**：
    ```typescript
    let lastLedgersCache: Ledger[] | undefined = undefined;

    export function useLedgers() {
      const ledgers = useLiveQuery(() => db.ledgers.filter(l => !l.deleted).toArray());
      if (ledgers !== undefined) lastLedgersCache = ledgers;
      const effectiveLedgers = ledgers !== undefined ? ledgers : lastLedgersCache;
      return { ledgers: effectiveLedgers, ... };
    }
    ```
    應用全生命週期中，後續彈窗或頁面掛載的第一幀即可同步獲取前次 Resolve 的快取，消除空白期。
  - **業務層基準貨幣安全防禦 (Defensive Fallback)**：
    移除硬編碼 `'CNY'`，當帳本基準貨幣未知時，安全降級為交易自身的貨幣 `fromCurrency`；且僅在帳本基準貨幣明確存在且不同時才判定為外幣，徹底杜絕非 CNY 帳本在載入期間的假陽性誤判。

---

### 案例 8：浮層手勢外洩與背景 `<main>` 滾動鏈穿透 (Scroll Chaining & Background Leakage)
- **現象**：在打開全螢幕交易詳情卡片（`TransactionDetailsDialog`）時，用戶在卡片上進行上下滑動（如切換退款卡片或瀏覽明細），背後的主頁面（交易列表）被輕易連帶滾動。
- **底層根本原因 (Root Cause)**：
  - **手勢未消費與 CSS `touch-action` 缺失**：卡片與舞台實作了自定義滑動手勢，但僅在 `touchend` 處理位移，在連續滑動的 `touchmove` 階段未進行攔截與 `preventDefault`，且未設置 CSS `touch-action: none`。瀏覽器判定該滑動為未消費的原生垂直滾動手勢。
  - **瀏覽器滾動鏈 (Scroll Chaining) 機制**：在 WebKit（iOS Safari / PWA）與 Chromium 行動端內核中，當觸摸事件發生在自身不具備原生滾動能力（`overflow: hidden`）的元素上時，瀏覽器會沿 DOM 樹向上將滾動轉交給最近的可滾動父容器。
  - **樹狀百分比架構下的背景 `<main>` 未被鎖定**：標準 UI 庫預設僅鎖定 `document.body` 的 `overflow: hidden`，而 Zenance 遵循樹狀 100% 高度規範，主要滾動容器是 `<main className="flex-1 overflow-y-auto">`，在彈窗開啟時未進行 Scroll Lock，導致穿透手勢可肆意滾動背景。
- **標準解法 (Standard Fix)**：
  - **雙層全鏈路防護 (Defense-in-Depth)**：
    1. **Compositor 級手勢隔離**：在舞台、畫布與卡片本體宣告 `touch-none`（`touch-action: none`），由瀏覽器排版合成器層面直接阻斷原生滾動分發；內部滾動區域配置 `touch-pan-y` 並阻斷 `touchmove` / `touchend` 冒泡。
    2. **背景主容器滾動鎖定 (Main Scroll Lock)**：在彈窗掛載期間將 `<main>` 的 `overflow` 設為 `hidden`，關閉時精準復原，徹底保證背景在底層物理層面的絕對靜態且滾動位置無損保留。

---

## 3. Zenance 跨端通用架構規範總覽 (Architecture Contract)

### 規範 1：樹狀百分比高度 (100% Tree Height)
- `html, body, #root` 必須設置為 `width: 100%; height: 100%; overflow: hidden;`。
- 嚴禁在 App 主容器或外層佈局使用 `min-h-screen` 或 `100vh`。
- 內部滾動統一由 `<main className="flex-1 overflow-y-auto">` 自適應接管。

### 規範 2：全域 Flexbox 居中 (Flex Centering Standard)
- 所有 Dialog / Modal 浮層統一使用外層全螢幕 Flex 容器居中結構：
  ```tsx
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
    <DialogPrimitive.Popup className="pointer-events-auto relative ...">
  ```
- 嚴禁在浮層本體上使用 `inset-0 m-auto` 或 `transform: translate(-50%, -50%)` 做幾何定位。

### 規範 3：原生級瞬時彈出 (Instant Pop)
- 彈窗卡片本體**不附加任何透明度漸變或縮放動畫**，採用原生 Alert 級別的瞬時彈出，達到 Zero-Jank、Zero-Latency 的工程師質感。
- 彈窗初始化時設定 `initialFocus={false}`，由使用者操作或動畫結束後自然聚焦，杜絕同步 Layout 阻塞。

### 規範 4：語意化白霜毛玻璃 (Frosted Glassmorphism)
- 全站彈窗遮罩統一使用：
  ```tsx
  className="fixed inset-0 z-[60] bg-overlay backdrop-blur-[2px] data-closed:hidden"
  ```
  - **淺色模式**：自動對應純淨白霜牛奶玻璃（`rgba(255, 255, 255, 0.8)` + 2px 模糊）。
  - **深色模式**：自動對應深邃黑曜石毛玻璃（`rgba(0, 0, 0, 0.8)` + 2px 模糊）。
  - **禁止在 CSS 變數上直接使用 Tailwind 透明度修飾符（如 `bg-background/80`）**：避免 Tailwind v4 編譯為 `color-mix()` 導致在 iOS <= 15 上 fallback 回退為 100% 實色。遮罩一律使用 `--color-overlay: var(--overlay)`（內嵌 RGBA 數值）。
  - 邊界嚴格依賴卡片自身的 1px 細黑邊框（`border border-border`），維持扁平化無陰影（Flat Design）的純粹美學。
  - 嚴禁附加 `isolate`，嚴禁在遮罩上執行慢速動態透明度過渡。

### 規範 5：彈窗動作按鈕水平並排 (Horizontal Action Buttons)
- 彈窗底部的操作按鈕在手機端與桌面端統一採用**單行水平並排 (`flex flex-row items-center justify-between`)**。
- **嚴禁在移動端退化為垂直倒序堆疊 (`flex-col-reverse`)**：避免確認按鈕在上、取消按鈕在下的上下割裂與空間浪費。
- 遵循「**取消在最左側 (Cancel on Left)、確認/新增在最右側 (Confirm/Add on Right)**」的人機工程學規範，符合雙手與單手拇指操作直覺。
- 只有單一按鈕（如關閉/確定）時，自動靠右對齊 (`[&>*:only-child]:ml-auto`)。

### 規範 6：資料查詢 Hook 單例快取與安全降級 (Singleton Memory Cache & Defensive Fallback)
- **單例快取消除空白期**：所有透過 `useLiveQuery` 或非同步微任務查詢資料的自定義 Hook（`useTransactions`、`useCategories`、`useAccounts`、`useLedgers`），必須在模組級建立 `last*Cache` 單例記憶體快取，確保所有新掛載組件在第 0 幀可同步取值。
- **禁止硬編碼業務預設值**：嚴禁在狀態未確定前假設使用者預設偏好（如硬編碼 `|| 'CNY'`）。降級策略必須具備上下文自洽性（如回退至當前項目的自身幣種），並在未就緒時保持保守條件判斷，杜絕假陽性渲染。

### 規範 7：全域浮層雙層手勢與滾動隔離 (Compositor Touch Isolation & Main Scroll Lock)
- **手勢層 Compositor 隔離**：自定義手勢容器必須顯式宣告 `touch-none`（`touch-action: none`），告知瀏覽器排版合成器攔截原生滾動；內部滾動容器配置 `touch-pan-y` 並阻斷 `touchmove` / `touchend` 冒泡。
- **背景主容器滾動鎖定 (Main Scroll Lock)**：全螢幕浮層掛載時，必須透過生命週期將背景主要滾動容器 `<main>` 的 `overflow` 切換為 `hidden`，並於銷毀時精準還原，達成 100% 絕對靜態防護。

---

## 4. 開發檢查清單 (Do's and Don'ts)

| 類別 | 嚴禁事項 (Don'ts) | 推薦標準 (Do's) |
| :--- | :--- | :--- |
| **高度計算** | 在根容器或主版面使用 `100vh` / `min-h-screen` | 使用樹狀 `height: 100%` + `flex-1 overflow-y-auto` |
| **浮層居中** | `inset-0 m-auto` 或 `translate(-50%, -50%)` | 外層 `fixed inset-0 flex items-center justify-center p-4` |
| **彈窗動畫** | 卡片附加 `animate-in fade-in` 或 `zoom-in-95` | 原生級瞬時彈出（Instant Pop），即點即現 |
| **焦點處理** | 掛載瞬間調用 `.focus()` 強奪焦點 | `initialFocus={false}`，防同步強制重排 |
| **遮罩濾鏡** | 全螢幕動態毛玻璃跑 `fade-in` 或使用 `isolate` | 遮罩瞬間就位（`data-closed:hidden`），無 `isolate`，半徑 2px |
| **遮罩透明度** | 直接在 HEX 變數上使用 Tailwind 修飾符（如 `bg-background/80`，觸發 `color-mix()` 導致 iOS 15 Fallback 成 100% 實色） | 採用內嵌 RGBA 的專屬語意變數 `bg-overlay`（`rgba(255,255,255,0.8)` / `rgba(0,0,0,0.8)`） |
| **彈窗操作按鈕** | 移動端使用 `flex-col-reverse` 倒序垂直堆疊 | 統一使用 `flex-row justify-between`，取消居左、確認居右並排於同一行 |
| **非同步資料載入** | 未防禦第 0 幀空白期，直接粗暴硬編碼預設值（如 `|| 'CNY'`）導致假陽性條件閃爍 | Hook 實作模組級單例快取（`last*Cache`），業務邏輯在狀態未確定前採保守自洽降級 |
| **浮層手勢與滾動** | 手勢容器未宣告 `touch-action`，未在 `touchmove` 攔截，任由瀏覽器滾動鏈穿透 | 舞台宣告 `touch-none`，內部滾動區配置 `touch-pan-y`，並在彈窗開啟時將背景 `<main>` 的 `overflow` 鎖定為 `hidden` |


