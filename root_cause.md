# Root Cause 分析報告：代付 Dialog 四周留白過多且不符合設計標準

## 1. 現象描述
在代付彈窗（`SplitAdvanceDialog`）中：
1. 視窗四周留白（Padding）異常巨大，標題、卡片與操作按鈕深深向內縮排。
2. 內容區域高度被異常拉伸，在「+ 添加對象」與底部「取消/確認」按鈕之間產生了大片空洞無效的白色空白。
3. 右上角「✕」關閉按鈕與內部標題排版錯位。
4. 整體表現嚴重背離 Zenance 標準 Dialog「由內容自然緊湊撐開、無多餘巢狀留白」的設計規範。

---

## 2. 根本原因定位 (Root Causes)

### 原因一：CSS 響應式斷點優先級導致的「雙重內邊距疊加 (Double Padding Collision)」
- 在 [src/components/ui/dialog.tsx](file:///d:/GitHub/Zenance/src/components/ui/dialog.tsx#L110) 中，底層 `DialogContent`（即 `DialogPrimitive.Popup`）預設帶有響應式內邊距：
  ```tsx
  className="... p-5 sm:p-6 ..."
  ```
- 在 [src/components/transactions/SplitAdvanceDialog.tsx](file:///d:/GitHub/Zenance/src/components/transactions/SplitAdvanceDialog.tsx#L394) 中，傳入的覆蓋樣式為：
  ```tsx
  className="... p-0 gap-0 ..."
  ```
- **衝突點**：Tailwind CSS 的 `p-0` 僅能覆蓋移動端基礎樣式 `p-5`，**完全無法覆蓋高優先級的 `sm:p-6`（24px）**。
- 因此在桌面端或大於 640px 的環境下，彈窗外層先被注入了 `24px` 的邊距，而彈窗內部的 Header、Body、Footer 又各自聲明了 `px-4`（16px）與 `p-3.5`（14px）。
- 兩者累加產生高達 **38px ~ 40px** 的巨大外圍邊距，導致彈窗四周產生極為空曠的視覺缺陷。

---

### 原因二：底層 Selector 強制注入 `flex-1` 與高度未自然包裹
- 在 [src/components/ui/dialog.tsx](file:///d:/GitHub/Zenance/src/components/ui/dialog.tsx#L111) 中，底層帶有通用子元素選擇器：
  ```css
  [&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:flex-1
  ```
- 在 [src/components/transactions/SplitAdvanceDialog.tsx](file:///d:/GitHub/Zenance/src/components/transactions/SplitAdvanceDialog.tsx#L404) 中，中間內容容器自身也聲明了 `flex-1`：
  ```tsx
  <div className="flex-1 overflow-y-auto ...">
  ```
- 此外，彈窗外層設定了 `max-h-[90vh]` 與彈窗預設的 flex-col 縱向拉伸，違反了 UI Guidelines 中「**彈窗本體高度嚴格由內容自然撐開 (Height driven by content)**」的規範。
- 當列表僅有 1 位使用者（「我 自費支出」）時，內容根本不足以填滿預期高度，但 flex-1 與拉伸容器強行將底部 Footer 推擠到最下方，致使中間留出大片無意義的空白斷層。

---

### 原因三：彈窗標準結構與原生 Close Button 的職責錯位
- `dialog.tsx` 預設會在彈窗本體絕對定位渲染右上角關閉按鈕（`absolute top-4 right-4`），並受外層 `showCloseButton` 控制。
- 由於外層 `sm:p-6` 與未關閉原生按鈕的影響，使得內部自定義佈局與外層結構產生衝突，造成右上角關閉按鈕孤立懸浮、內容深陷其中的視覺割裂。
