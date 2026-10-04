# Root Cause 診斷報告：交易詳情大金額懸停非正中間位置高速頻閃

## 1. 故障現象描述
在交易詳情卡片中，面對 1 萬以上的大金額，當使用者將滑鼠懸停在金額的「非正中間位置」（如偏左側或偏右側）時，金額與跑馬燈組件會發生極高頻率（每秒約 60 次）的閃爍（Hover Strobe / Jitter），只有當滑鼠精確停留在水平正中間時才不會頻閃。

---

## 2. 核心代碼定位

1. **懸停事件掛載節點與自適應寬度（Inline-Flex）**：
   - 檔案：`src/components/transactions/TransactionDetailsDialog.tsx`
   - 代碼位置（`VoucherHeroAmount` 組件）：
     ```tsx
     <div
       onClick={handleClick}
       onMouseEnter={handleMouseEnter}
       onMouseLeave={handleMouseLeave}
       className={cn(
         "inline-flex items-center justify-center transition-opacity duration-150 select-text",
         isLargeAmount && "cursor-pointer hover:opacity-90 active:scale-[0.99]"
       )}
     >
       <AmountDisplay ... compact={showCompact} />
     </div>
     ```
2. **跑馬燈外層容器與居中佈局排版**：
   - 檔案：`src/components/ui/AutoMarquee.tsx`
   - 代碼位置（第 106～124 行）：
     ```tsx
     <div
       ref={containerRef}
       className={cn(
         'overflow-hidden max-w-full w-full [backface-visibility:hidden]',
         isOverflowing
           ? ...
           : align === 'center'
             ? 'flex justify-center text-center'
             : ...
       )}
     >
     ```

---

## 3. 底層根本原因剖析 (Why & Root Cause)

### 根因：DOM 碰撞偵測（Hit-Testing）邊界突變引發的「懸停正反饋震盪循環（Hover Flip-Flop Strobe）」

1. **初始狀態（完整長金額狀態，DOM 寬度大）**：
   - 當金額為完整數字時（如 `¥123,456,789.00`），文字長度極長，`VoucherHeroAmount` 的幾何寬度佔據了容器大部分甚至全部寬度（例如寬度為 280px）。
   - 此時使用者將滑鼠移動至偏左側或偏右側（例如距離卡片左側 40px 的位置），滑鼠落入該 280px 的 DOM 碰撞矩形內。

2. **觸發 `mouseenter` 進入縮寫狀態**：
   - 瀏覽器 Hit-Testing 判定游標進入 `VoucherHeroAmount`，觸發 `handleMouseEnter`，`isHovering` 變為 `true`。
   - 組件將 `compact` 切換為 `true`，金額瞬間縮短為金融縮寫（如 `¥123.5M`）。

3. **幾何邊界驟縮與父容器居中對齊（Bounding Rect Collapse & Centering）**：
   - 金融縮寫文字極短（寬度由 280px 驟降至約 60px）。
   - 由於寬度遠小於卡片容器，`AutoMarquee` 判定為未溢出，外層生效 `justify-center text-center`。
   - 這使得 `VoucherHeroAmount` 的整個 DOM 節點瞬間向卡片正中央收縮，其有效點擊/碰撞區域僅剩正中間寬度 60px 的範圍（約卡片水平 130px～190px 之間）。

4. **游標被動脫離 DOM 節點，引發 `mouseleave`**：
   - 使用者的滑鼠實體位置依然停留在偏左側（40px 處），但下方的 DOM 元素已在第 1 幀之內瞬間收縮至中央（130px 以外）。
   - 游標下方瞬間變為外層父容器的空白間距，不再命中 `VoucherHeroAmount` 節點。
   - 瀏覽器在下一幀的 Hit-Testing 中偵測到游標已不在該節點邊界內，**立刻觸發 `mouseleave` 事件**。

5. **觸發 `mouseleave` 恢復完整長金額**：
   - `handleMouseLeave` 執行，`isHovering` 變為 `false`，`compact` 變回 `false`。
   - 金額瞬間切換回 280px 的完整數字。
   - `VoucherHeroAmount` 的幾何寬度瞬間再次擴展至 280px，重新覆蓋了游標所在的偏左側（40px）位置。

6. **重新被游標覆蓋，再次觸發 `mouseenter`，形成每秒 60 幀的無限震盪**：
   - 游標再次進入擴展後的節點 ➔ 觸發 `mouseenter` ➔ 節點縮小至中央 ➔ 游標脫離 ➔ 觸發 `mouseleave` ➔ 節點放大覆蓋游標 ➔ 觸發 `mouseenter`...
   - 整個循環在瀏覽器渲染幀（每秒 60 次）中持續震盪，產生劇烈的高頻頻閃。
   - 只有當滑鼠恰好停留在正中間 60px 的交集範圍內時，DOM 節點縮小後仍能包覆住游標，才不會發生游標脫離現象。
