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
- **動畫與效能規範**：
  - 全站彈窗與過渡動畫只使用純合成器屬性「透明度（`opacity`）」，禁止使用覆蓋座標的複合 `transform` 縮放動畫（如 `zoom-in-95`）。
  - 過渡時間嚴格控制在 `duration-100 ease-out` 內，呈現極致俐落、瞬時響應的工程師質感。
- **視覺特效分離**：
  - 毛玻璃（`backdrop-filter`）僅限用於靜態固定的 Header 或導航列。
  - 任何帶有動態顯示/隱藏的遮罩層嚴禁執行帶動態 Alpha 漸變的毛玻璃計算；彈窗遮罩須瞬間就位或採用純色高對比遮罩（`bg-black/40`），徹底避免舊款 GPU 頻閃。
