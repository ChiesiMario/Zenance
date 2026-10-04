# Root Cause 診斷報告：新增分類與選擇帳戶 Dialog 本體被自身背景遮罩覆蓋與模糊

## 1. 故障現象描述
使用者在新增交易視窗中點擊「新增分類」彈窗或「選擇帳戶」彈窗時，彈出的卡片本體（包含標題、輸入框與按鈕），連同背景畫面全部被一層白色的毛玻璃遮罩（Backdrop）所覆蓋與模糊化。

---

## 2. 核心代碼定位
1. **底層彈窗外層容器 z-index 自動連動正則表達式**：
   - 檔案：`src/components/ui/dialog.tsx`
   - 代碼位置（第 65～67 行）：
     ```tsx
     const extractedZIndex =
       (typeof className === 'string' ? className.match(/\bz-(?:\[\d+\]|\d+)\b/)?.[0] : undefined) ||
       (typeof overlayClassName === 'string' ? overlayClassName.match(/\bz-(?:\[\d+\]|\d+)\b/)?.[0] : undefined)
     ```
2. **居中 Flex 外層容器**：
   - 檔案：`src/components/ui/dialog.tsx`
   - 代碼位置（第 99～103 行）：
     ```tsx
     <div className={cn(
       "fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none touch-none",
       extractedZIndex,
       wrapperClassName
     )}>
     ```
3. **調用端傳入的 Tailwind 任意值類名**：
   - 檔案：`src/components/transactions/AddTransactionModal.tsx`（第 1753～1754 行）
   - 檔案：`src/components/accounts/AccountSelectDialog.tsx`（第 145 行）
   - 代碼：`className="z-[70] ..."` 與 `overlayClassName="z-[70]"`

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因：正則表達式單詞邊界 `\b` 陷阱導致 `z-[70]` 匹配完全失效，彈窗外層容器層級始終停留在 `z-[60]`，被 `z-[70]` 遮罩覆蓋

1. **正則單詞邊界 `\b` 對中括號 `]` 失效**：
   - 在正則表達式 `/\bz-(?:\[\d+\]|\d+)\b/` 中，結尾使用了 `\b`（Word Boundary，單詞邊界）。
   - 在正則規範中，`\b` 定義為 `\w`（ASCII 字母、數字、底線）與 `\W`（非字母數字字符）之間的交界。
   - 在 Tailwind CSS 的任意值語法 `z-[70]` 中，最後一個字符為中括號 `]`，屬於 `\W`（非單詞字符）。
   - 當 `z-[70]` 後方緊接著空格（如 `"z-[70] sm:max-w-[320px]"`）時，空格亦屬於 `\W`。
   - 由於 `]` 與空格均為 `\W`，兩者之間**不存在單詞邊界**，導致正則表達式評估結果永遠為 `null`：
     ```js
     'z-[70] sm:max-w-[320px]'.match(/\bz-(?:\[\d+\]|\d+)\b/) // => null
     ```
2. **提取變數 `extractedZIndex` 恆為 `undefined`**：
   - 無論調用端在 `className` 或是 `overlayClassName` 傳入 `z-[70]`、`z-[80]` 等 Tailwind 任意值類名，`extractedZIndex` 始終為 `undefined`。
3. **外層 Flex 容器層級無法提升，仍固定在 `z-[60]`**：
   - 由於未匹配成功，`cn("fixed inset-0 z-[60] ...", extractedZIndex, wrapperClassName)` 中完全沒有注入 `z-[70]`。
   - 外層居中 Flex 容器的樣式依然維持寫死的 **`z-[60]`**。
4. **遮罩組件成功解析為 `z-[70]`**：
   - 遮罩節點 `<DialogOverlay>` 透過 `cn("fixed inset-0 z-[60] ...", overlayClassName)` 渲染，`overlayClassName="z-[70]"` 經由 `tailwind-merge` 成功將遮罩的層級提升至 **`z-[70]`**。
5. **最終呈現現象**：
   - 遮罩層：`fixed inset-0 z-[70]`
   - 彈窗外層容器：`fixed inset-0 z-[60]`
   - 在瀏覽器 CSS 堆疊上下文計算中，`70 > 60`。遮罩直接覆蓋在包含整個彈窗卡片的外層容器正前方，導致新增分類 Dialog 與選擇帳戶 Dialog 的本體連同背景一併被遮罩模糊化。
