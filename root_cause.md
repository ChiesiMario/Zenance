# Root Cause 診斷報告：手機端「設置」中外觀主題與語言選擇按鈕黏連

## 1. 問題現象描述
- **發生位置**：「設置 (Settings)」頁面 ->「偏好設置」區塊中的「外觀主題」與「界面語言」選項。
- **具體異常現象**：
  在手機版（螢幕寬度小於 `md: 768px`）且處於深色模式下，右側的兩個選擇器按鈕（`SelectTrigger`）高度撐滿了整行，各自呈現出大塊深灰色膠囊背景（`dark:bg-input/30`）。
  因為每一行外層高度為固定 `h-12`（48px），第一行的按鈕下邊界與第二行的按鈕上邊界在垂直方向無縫相接、完全黏合貼緊在一起，視覺上合併成了一個不規則的大型深色色塊。

---

## 2. 根本原因 (Root Cause) 詳細剖析

### (1) `SelectTrigger` 預設樣式的 CSS 特異性 (Specificity) 覆蓋失敗
在 [src/components/ui/select.tsx](file:///d:/GitHub/Zenance/src/components/ui/select.tsx) 中，`SelectTrigger` 預設的尺寸為 `size="default"`，並包含以下 Tailwind 樣式規則：
```tsx
data-[size=default]:h-12 md:data-[size=default]:h-10 py-3 md:py-2 dark:bg-input/30 rounded-lg
```
而在 [src/pages/Settings.tsx](file:///d:/GitHub/Zenance/src/pages/Settings.tsx) 的呼叫端中，設計初衷是希望該選擇器呈現為無背景、高度隨文字自適應的純文本風格，因此傳入了自定義 class：
```tsx
<SelectTrigger className="border-none shadow-none focus:ring-0 bg-transparent text-right justify-end [&>span]:mr-1 text-xs font-mono text-muted-foreground hover:text-foreground h-auto p-0 cursor-pointer">
```

然而，由於 CSS 特異性與選擇器層級問題，自定義的 class 無法覆蓋預設樣式：
1. **高度覆蓋失敗**：
   預設的 `data-[size=default]:h-12` 使用了屬性選擇器 `[data-size="default"]`，其 CSS 特異性權重為 `(0, 2, 0)`（類選擇器 + 屬性選擇器），遠高於傳入的普通類別 `.h-auto` 的權重 `(0, 1, 0)`。因此，`h-auto` 被瀏覽器完全忽略，高度被強行鎖定在 `h-12`（48px）。
2. **深色背景覆蓋失敗**：
   預設樣式包含變體選擇器 `.dark .dark:bg-input/30`。呼叫端僅傳入了普通類別 `bg-transparent`（未加 `dark:` 變體），在深色模式下，帶 `.dark` 祖先選擇器的 `dark:bg-input/30` 優先權高於 `bg-transparent`，導致背景依然渲染為深灰色。
3. **內邊距覆蓋失敗**：
   在手機端（非 `md` 視窗下），預設的 `py-3`（上下各 12px 內邊距）同樣壓迫佈局空間。

### (2) 組件未宣告 `size="custom"`
`SelectTrigger` 組件本身實作了 `size?: "sm" | "default" | "custom"` 機制：
```tsx
size !== "custom" && [ /* 一整串帶 h-12、py-3、dark:bg-input/30 的表單樣式 */ ],
size === "custom" && "outline-none select-none transition-colors",
className
```
但 `Settings.tsx` 中的「外觀主題」與「界面語言」調用時**並未傳入 `size="custom"`**，導致預設回退為 `size="default"`，強制注入了全套表單按鈕的尺寸與背景樣式。

### (3) 行高與按鈕尺寸的幾何相撞
在 [src/pages/Settings.tsx](file:///d:/GitHub/Zenance/src/pages/Settings.tsx) 中，清單單行容器的高度固定為 `h-12`（48px）：
```tsx
<div className="h-12 px-4 flex items-center justify-between ...">
```
- **在桌面端 (`>= 768px`)**：預設高度切換為 `md:data-[size=default]:h-10`（40px），在 48px 的行高內部上下各留有 4px 間隙（共 8px 空隙），因此按鈕看似各自獨立。
- **在手機端 (`< 768px`)**：按鈕高度為 `h-12`（48px），高度 100% 佔滿了整個行高。第一行按鈕底部與第二行按鈕頂部完全重合貼合，深灰膠囊背景由此無縫黏連。
