---
trigger: always_on
---

# UI Design Standards & Guidelines (Zenance)

## 1. 核心風格 (Core Style)
- **Vercel / Next.js 風格**：追求極簡、高對比、具備工程師質感的現代設計。
- **純粹的對比**：嚴格使用純黑 (`#000`) 與純白 (`#fff`) 作為主要背景與文本對比。捨棄傳統的柔和灰色背景。
- **扁平化設計 (Flat Design)**：**絕對禁止**在卡片 (Cards) 或容器上使用任何陰影 (`shadow-sm`, `shadow-md` 等)。層級的區分完全依賴細而精緻的邊框 (`border border-border`)。
- **字體運用 (Typography)**：
  - 數字、金額與統計數據嚴格使用等寬字體 (`font-mono`)，確保對齊與精確感。
  - 大標題使用緊湊的字距 (`tracking-tight`)，小標籤（如 Category, Date 等提示）使用大寫寬字距 (`uppercase tracking-widest text-xs`)。
  - **中英數排版規則**：所有中文文案（包含 i18n 翻譯檔）都必須嚴格遵循「在中文與英文/數字之間插入一個半形空格」的排版規範（Pangu Spacing），例如「使用 Vite 開發」而不是「使用Vite開發」。

## 2. 佈局與元件 (Layout & Components)
- **無邊界大輸入框 (Borderless Inputs)**：金額輸入（如 Add Transaction）應採用置中、無邊框、無背景的超大字體 (`text-6xl font-bold`) 設計，捨棄傳統的 Input 框外觀。
- **網格卡片 (Grid Cards)**：帳戶 (Accounts) 等清單採用獨立的並列卡片設計（類似 Apple Wallet 概念），無陰影，僅靠邊框與內部留白界定範圍。
- **Usage Dashboard 佈局**：設定頁或表單區塊，採用 Vercel Usage 儀表板的表格式 List 佈局，使用 `divide-y divide-border` 進行行間分隔。
- **毛玻璃效果 (Glassmorphism)**：底部導覽列 (Bottom Nav) 或懸浮標頭使用半透明毛玻璃背景 (`bg-background/80 backdrop-blur-md`)。

## 3. 國際化與多語系 (i18n)
- 專案已全面導入 `react-i18next`。
- 新增或修改任何 UI 文字時，**必須**使用 `t('key')` 函數，並同步更新 `src/i18n/locales/` 下的 `en.json`, `zh-TW.json`, `zh-CN.json` 三份語系檔。
- **絕對禁止**在 Component 程式碼中寫死 (hardcode) 任何中文或英文文案。
- Zod 等表單驗證錯誤訊息，也必須與 i18n 系統掛鉤。

## 4. 跨端通用設計契約 (Cross-Platform Architecture Contract)
- **拒絕平台特化補丁 (No Platform Hacks)**：嚴禁為特定作業系統、特定瀏覽器或舊款晶片編寫特殊條件判斷或臨時修補；所有 UI 與交互必須以標準 Web 規範達到全平台通用。
- **高度管理規範**：全面採用「樹狀 100% 高度（`height: 100%`）」，禁止在根容器或主佈局使用 `100vh` 避免移動端工具列遮擋溢出。內部滾動由 `<main className="flex-1 overflow-y-auto">` 自適應接管。
- **彈窗與居中規範**：
  - 嚴禁在彈窗本體上使用 `inset-0 m-auto` 或 `transform: translate(-50%, -50%)` 做幾何定位。
  - 所有浮層與 Modal 必須使用外層「全螢幕 Flex 容器居中（`fixed inset-0 flex items-center justify-center p-4 pointer-events-none`）」架構，彈窗本體為普通 block（`pointer-events-auto`），高度嚴格由內容自然撐開。
  - **禁止彈窗巢狀聲明 (No Nested Dialogs in DialogContent / Flat Sibling Portals)**：
    - 所有 Dialog / Modal 元件在 JSX 結構中必須以平級兄弟節點（Sibling Node，使用 `<> ... </>` Fragment 平鋪）聲明，**絕對禁止**將次級 `<Dialog>` 寫在另一個 `<DialogContent>` 的 DOM 樹或 JSX 內部。
    - 巢狀聲明會觸發底層 Portal 上下文（如 Base UI / Floating UI）將子 Portal 自動吸附至父級 Portal 容器，導致次級彈窗的毛玻璃遮罩 (`Backdrop`) 被父層實色卡片壓制、吞噬或失效，造成子彈窗彈出時背景失去暗化遮罩。
    - 底層 `DialogContent` 必須將 Portal container 預設指定為 `document.body`，實現全域獨立渲染防護。
  - **多層彈窗遮罩棧規範 (Multi-layer Dialog Stacking)**：
    - 當主彈窗層級為 `z-[60]` 時，於其上疊加呼出的次級彈窗（Secondary Dialog，如新增分類、選擇帳戶、代付分帳、二次確認等）其遮罩層與彈窗本體必須指定更高層級（如 `overlayClassName="z-[70]"` 與 `className="z-[70] ..."`），確保第二層彈窗能清晰、高對比地遮蓋在第一層彈窗之上，形成清晰聚焦的層次感。
  - **焦點管理與禁止自動聚焦 (Dialog Focus & No Auto-Focus)**：
    - 彈窗掛載時禁止第 0 幀同步強奪焦點（`initialFocus={false}`），避免觸發整頁同步強制重排（Forced Synchronous Reflow）。
    - **嚴禁自動聚焦輸入框**：所有 Dialog 彈窗掛載出現時，**絕對禁止**在任何輸入框（如 `Input`、`AmountInput` 等）上設置 `autoFocus` 屬性，亦禁止透過 JS 強行調用 `.focus()`。自動聚焦會導致輸入鍵盤（桌面端懸浮數字鍵盤或行動端原生軟鍵盤）直接出現從而遮擋彈窗內容，破壞用戶看清彈窗完整資訊（如標題、說明、帳戶、金額上限等）的體驗。鍵盤必須交由用戶主動點擊目標欄位時呼出。
- **動畫與彈窗彈出規範 (Instant Pop)**：
  - Dialog / Modal 彈窗本體全面採用**「原生級瞬時彈出 (Instant Pop)」**，嚴禁在卡片上附加慢速 `animate-in fade-in` 動畫，徹底避免在舊款設備（如 A9/A10 晶片、iOS 15）上因底層光柵化搶佔時間片導致動畫殘缺與嚴重掉幀卡頓。
  - 彈窗呈現應如同 Vercel、Raycast 及 macOS 原生 Alert 般即點即出、清脆乾脆。
- **毛玻璃與遮罩規範 (Frosted Glassmorphism)**：
  - 遮罩層全面使用專屬語意化變數：`bg-overlay backdrop-blur-[2px] data-closed:hidden`。在淺色模式下呈現純淨白霜牛奶玻璃（`rgba(255, 255, 255, 0.8)`），深色模式下呈現深邃黑曜石毛玻璃（`rgba(0, 0, 0, 0.8)`）。
  - **嚴禁在動態 CSS 變數上直接使用 Tailwind 透明度修飾符（如 `bg-background/80`）**：Tailwind CSS v4 會將帶動態變數的透明度編譯為 CSS `color-mix()` 函式；而 iOS <= 15 的舊版 WebKit（如 iPhone 7P、SE 1）完全不支援 `color-mix()`，會觸發其 Fallback 回退機制變成 100% 完全不透明實色（純白或純黑），造成遮罩覆蓋整個螢幕。所有遮罩一律使用 `--color-overlay: var(--overlay)`（內嵌 RGBA Alpha 通道），確保全平台 WebKit 均能原生解析。
  - 遮罩層嚴禁使用 `isolate`（避免觸發 WebKit 整頁圖層扁平化重繪）。
  - 模糊半徑嚴格限制在 `2px`（`backdrop-blur-[2px]`），確保舊款 GPU 卷積計算耗時 `< 16ms`，維持滿幀 60fps。
  - 遮罩層嚴禁使用動態 Alpha 漸變動畫，必須瞬間就位（`data-closed:hidden`），徹底杜絕 GPU 紋理重構頻閃。
- **彈窗動作按鈕佈局 (Dialog Footer Actions)**：
  - 手機端與全平台 DialogFooter 按鈕嚴格採用**單行水平並排 (`flex flex-row items-center justify-between`)**。
  - **嚴禁在移動端退化為垂直倒序堆疊 (`flex-col-reverse`)**，避免主要按鈕上下割裂與非必要的縱向空間浪費。
  - 遵循「**取消在最左側 (Cancel on Left)、確認/新增在最右側 (Confirm/Add on Right)**」的人機工程學規範，符合雙手與單手拇指操作直覺。
  - 當彈窗僅有單一按鈕（如關閉/確定）時，必須自動靠右對齊 (`[&>*:only-child]:ml-auto`)。
- **彈窗高度穩定性與防抖規範 (Dialog Height Stability & Anti-Jitter)**：
  - **嚴禁動態插入新元素撐大彈窗容器**：彈窗本體高度必須保持絕對穩定。嚴禁在交互過程中（例如表單驗證錯誤、動態提示、警告訊息等）動態在彈窗內部插入或移除額外的文字行或區塊從而導致彈窗高度突增（Layout Shift / Jitter），這會造成視覺跳動並破壞原生級精緻質感。
  - **狀態提示規範**：錯誤與警告應優先透過元件本身的視覺狀態切換（如輸入框文字變紅 `text-destructive`、邊框變色、確認按鈕動態禁用 `disabled`、既有佔位欄位狀態切換）或透過全域 Toast 提示呈現，確保彈窗幾何尺寸在任何互動狀態下均維持恆定。
- **破壞性動作按鈕規範與動態變數透明度禁令 (Destructive Buttons & Dynamic Alpha Prohibition)**：
  - **實色紅底白字規範**：二次確認與破壞性高危操作的 `destructive` 按鈕統一採用「實色紅底 + 純白文字（`bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-80`）」，符合 Apple HIG 人機工程學與 Shadcn 規範，嚴禁使用 `bg-destructive/10 text-destructive` 等淡底弱化樣式。
  - **嚴禁動態 CSS 變數透明度修飾符**：嚴禁在任何引用自動態 CSS 變數的屬性上直接附加 Tailwind 透明度修飾符（如 `bg-destructive/10`、`bg-background/80` 等），徹底杜絕 Tailwind v4 編譯為 `color-mix()` 導致舊版 WebKit（如 iPhone SE 1、iOS 15）觸發 100% 實心色 Fallback。



