# Root Cause 診斷報告：iPhone SE 點擊刪除交易出現「紅底紅字，文字不可見」問題排查

## 1. 現象分析 (Phenomenon)
在 iPhone SE（第一代或運行 iOS <= 15.8 系統的設備）上，點擊刪除交易彈出的二次確認彈窗（`ConfirmDialog`）中，右側的「刪除（確認）」按鈕呈現為 **100% 完全不透明的實心紅色背景**，且按鈕上的「刪除」文字也是**紅色**，導致紅底紅字完全融為一體，文字徹底不可見。
而在桌面端瀏覽器、Android 以及較新版本 iOS（>= 16.2）設備上，該按鈕則正常呈現為淡紅色半透明背景配紅色文字。

---

## 2. 核心代碼定位 (Code Location)

- **檔案 1**：[`src/components/ui/button.tsx`](file:///d:/GitHub/Zenance/src/components/ui/button.tsx)（第 17～18 行）
  ```typescript
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
  ```
- **檔案 2**：[`src/components/ui/confirm-dialog.tsx`](file:///d:/GitHub/Zenance/src/components/ui/confirm-dialog.tsx)（第 107～114 行）
  ```tsx
  <Button
    type="button"
    variant={variant === 'destructive' ? 'destructive' : 'default'}
    className="cursor-pointer w-full"
    onClick={handleConfirm}
  >
    {confirmText || t('common.confirm')}
  </Button>
  ```
- **檔案 3**：[`src/index.css`](file:///d:/GitHub/Zenance/src/index.css)（第 90 行、第 113 行）
  ```css
  :root {
    --destructive: #ff0000;
  }
  .dark {
    --destructive: #ff453a;
  }
  ```

---

## 3. 底層原因剖析 (Root Cause)

1. **Tailwind CSS v4 動態變數透明度的 `color-mix()` 編譯機制**：
   在 `button.tsx` 中，`destructive` 變體按鈕採用了帶透明度修飾符的類名 `bg-destructive/10`（深色模式下為 `dark:bg-destructive/20`），而 `--destructive` 引用的是 HEX 色值變數（`#ff0000` / `#ff453a`）。
   Tailwind CSS v4 在處理帶 CSS 變數的透明度修飾符時，編譯出的 CSS 規則依賴 CSS Color Module Level 4 的 `color-mix()` 函式，並提供了兜底回退：
   ```css
   .bg-destructive\/10 {
     background-color: var(--color-destructive); /* 不透明實色 Fallback */
   }
   @supports (color: color-mix(in oklab, red, red)) {
     .bg-destructive\/10 {
       background-color: color-mix(in oklab, var(--color-destructive) 10%, transparent);
     }
   }
   ```

2. **iOS 15 舊版 WebKit 缺乏 `color-mix()` 支援**：
   Apple WebKit 引擎直到 **Safari 16.2 / iOS 16.2** 才實作 `color-mix()` 規範。iPhone SE 1（最高支援至 iOS 15.8.x）或任何處於 iOS 15 系統下的 WebKit 內核完全不支援 `color-mix()`，因此 `@supports` 查詢判定為 `false`。

3. **Fallback 觸發引發「紅底紅字」視覺災難**：
   WebKit 被迫退回到最外層的 Fallback 屬性：`background-color: var(--color-destructive)`。
   這使得原本期望的 10% / 20% 淡紅半透明背景，在 iPhone SE 上被強制渲染為 **100% 完全不透明的純紅色大實底**；
   而按鈕的文字顏色恰好又是 `text-destructive`（純紅色），兩者顏色完全相同，導致「文字消失在相同顏色的背景中」，文本 100% 不可見。
