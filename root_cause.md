# Root Cause 診斷報告：交易詳情卡片在手機端滑動困難、可滑動區域過小問題排查

## 1. 現象分析 (Phenomenon)

在行動端（手機螢幕）檢視交易詳情卡片時：
1. **滑動操作極度困難且高頻失靈**：用戶需要非常小心地將手指精準按在中間卡片區域內滑動才有可能觸發切換；
2. **可滑動區域嚴重受限**：手指只要稍偏離中央卡片本體（例如滑動起始或終止於螢幕兩側空白、卡片頂部或底部留白），滑動便完全無任何反應；
3. **滑動時極易誤觸關閉**：用戶在卡片周邊的空白區域嘗試拖曳或滑動時，卡片不僅沒有切換，反而經常直接觸發彈窗關閉（退出詳情頁）；
4. **缺乏跟手反饋（Non-responsive Dragging）**：滑動過程中卡片畫面完全靜止，僅在手指放開後瞬間跳轉，給用戶帶來「未識別到手勢、卡頓或滑不動」的遲鈍感知。

---

## 2. 核心代碼定位 (Code Location)

- **檔案**：[`src/components/transactions/TransactionDetailsDialog.tsx`](file:///d:/GitHub/Zenance/src/components/transactions/TransactionDetailsDialog.tsx)

### 2.1 觸控事件監聽容器邊界極度狹窄（第 1246～1268 行）
```tsx
{/* Scrollable / Centered 2D Stage (佔滿全螢幕高度) */}
<div
  ref={stageRef}
  className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto select-none touch-none"
  onWheel={handleWheel}
  onClick={onClose}
>
  <div
    onTouchStart={handleTouchStart}
    onTouchEnd={handleTouchEnd}
    className={cn(
      "absolute left-0 top-0 cursor-default will-change-transform touch-none",
      ...
    )}
    style={{
      transform: `translate3d(${currentTranslateX}px, ${currentTranslateY}px, 0)`,
      width: `${totalCanvasWidth}px`,
      height: `${parentHeight + CONNECTOR_HEIGHT + childrenHeight}px`,
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    {/* 內部卡片渲染 */}
  </div>
</div>
```

### 2.2 粗糙的手勢判定邏輯與即時反饋缺失（第 632～658 行）
```tsx
const touchStartX = useRef<number>(0);
const touchStartY = useRef<number>(0);

const handleTouchStart = (e: React.TouchEvent) => {
  touchStartX.current = e.touches[0].clientX;
  touchStartY.current = e.touches[0].clientY;
};

const handleTouchEnd = (e: React.TouchEvent) => {
  const diffX = e.changedTouches[0].clientX - touchStartX.current;
  const diffY = e.changedTouches[0].clientY - touchStartY.current;

  if (Math.abs(diffY) >= Math.abs(diffX) && Math.abs(diffY) > 35) {
    if (diffY < -35) {
      navigateDown();
    } else if (diffY > 35) {
      navigateUp();
    }
  } else if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
    if (diffX < -35) {
      navigateRight();
    } else if (diffX > 35) {
      navigateLeft();
    }
  }
};
```

---

## 3. 底層原因剖析 (Root Cause)

### 3.1 根本原因一：觸控監聽範圍被局限在內層固定寬度的二維畫布，形成全螢幕「觸控盲區」
- 外層全螢幕容器 `stageRef` 擁有完整的全屏視野（`w-full h-full inset-0`），滑鼠滾輪事件 `onWheel` 也掛載在此全螢幕容器上。
- 然而，行動端觸控事件 `onTouchStart` 和 `onTouchEnd` **並未掛載在全螢幕 `stageRef` 上**，而是被掛載在內部二維平移的 Canvas `div` 上。
- 該 Canvas 的寬度為 `totalCanvasWidth`。在絕大多數單筆交易情境下，該寬度被嚴格限制在 `CARD_WIDTH = 280px`。
- 在一般手機（寬度 375px～430px）上，這意味著卡片左右兩側各留有約 45px～75px 的大面積空白區域，且卡片上下也有高達 100px 以上的安全留白。**所有這些留白區域完全不屬於 Canvas 的 DOM 矩形範圍**，手指在這些區域內觸碰或滑動時，`onTouchStart` 根本不會被觸發，直接造成「可滑動區域過小」的現象。

### 3.2 根本原因二：空白處滑動被瀏覽器合成為 Click 事件，誤觸 `onClose`
- 在 `stageRef` 上直接掛載了 `onClick={onClose}`。
- 當用戶在卡片周邊的空白區域（即上述觸控盲區）滑動手指時，由於該區域沒有任何 touch 事件攔截或 `preventDefault()`，瀏覽器在手指抬起後會將該動作合成為一個純粹的 `click` 事件。
- 這導致用戶嘗試滑動卡片的意圖，被直接識別為「點擊背景關閉」，彈窗瞬間被關閉。

### 3.3 根本原因三：完全缺乏 `onTouchMove` 即時位移反饋（跟手性為零）
- 目前的手勢實現僅在 `onTouchStart` 記錄座標，並在 `onTouchEnd` 比對位移是否大於 35px。
- 在整個手指拖曳移動的過程中（`touchmove`），元件完全沒有計算即時偏移量（`dragOffset`），二維相機在拖曳期間維持 100% 靜止不動。
- 這種「鬆手前毫無視覺回饋、鬆手後突變跳轉」的機制，在人機互動感知上極度遲鈍，用戶在滑動過程中無法確認手勢是否已被系統捕捉，更容易在途中因猶豫放慢而導致滑動距離不足被判定無效。

### 3.4 根本原因四：卡片內部文字選取樣式與 touch 事件的潛在干擾
- 卡片主體上設置了 `touch-none`，但內部備註區（`select-text`）與金額區（`select-all`）為了支援複製文字開啟了文本選取功能。
- 在行動端 WebKit 內核下，若手指觸控起點恰好位於此類文本元素上，容易被瀏覽器優先判定為長按文本選取或文字放大鏡（Magnifier），進而截斷後續的 touch 事件傳播。
