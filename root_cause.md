# Root Cause 分析報告：群組交易詳情刪除交易後介面陷入空白

## 1. 現象描述
- 在群組交易詳情（`TransactionDetailsDialog`）中，用戶點擊底部 Dock Bar 的「刪除」按鈕刪除了當前聚焦的交易（例如點擊進入詳情時的初始交易）。
- 刪除確認後，彈窗並未正常顯示剩餘的群組交易卡片，舞台中央的卡片瞬間全部消失，背後的毛玻璃 Backdrop 遮罩依然覆蓋整個螢幕，底部殘留 4 欄 Dock Bar（刪除、退款、編輯、關閉），介面徹底陷入空白與不可操作狀態。

---

## 2. 根本原因定位 (Root Cause)

### 根本原因一：數據錨點僵化綁定於外部 Props（Rigid Anchor to External `transactionId`）
- 在 [src/components/transactions/TransactionDetailsDialog.tsx](file:///d:/GitHub/Zenance/src/components/transactions/TransactionDetailsDialog.tsx#L217-L225) 中，組件將外部傳入的 `transactionId`（點擊打開彈窗時的初始交易 ID）作為錨定整個群組的唯一依據：
  ```tsx
  const initialRootTx = useMemo(() => {
    if (!transactionId || !transactions) return null;
    const clicked = transactions.find((t) => t.id === transactionId);
    if (!clicked) return null;
    if (clicked.parentId) {
      return transactions.find((t) => t.id === clicked.parentId) || clicked;
    }
    return clicked;
  }, [transactionId, transactions]);
  ```
- 當同群組內的多筆主交易需要被載入時，完全仰賴 `initialRootTx.splitGroupId` 來查詢整組交易：
  ```tsx
  const relatedRootTransactions = useMemo(() => {
    if (!initialRootTx || !transactions) return [];
    if (initialRootTx.splitGroupId) {
      const list = transactions.filter(
        (t) => !t.deleted && !t.parentId && t.splitGroupId === initialRootTx.splitGroupId
      );
      return sortTransactionsDesc(list);
    }
    return [initialRootTx];
  }, [initialRootTx, transactions]);
  ```
- 父組件（如 `GroupedTransactionList` 或 `AppLayout`）在打開彈窗時將 `transactionId` 傳入。當彈窗內部執行刪除時，父組件並不會同步將 `transactionId` 改為群組中的其他交易 ID。

---

### 根本原因二：響應式更新引發的級聯歸零連鎖崩潰（Reactive Cascade Collapse）
1. 用戶在彈窗中點擊「刪除」該筆交易時，調用 `deleteTransaction(activeTxId)`，該交易在本地資料庫（Dexie）中被更新為 `deleted: true`。
2. `useLiveQuery` 監聽到資料庫變更，向組件推送最新過濾後的 `transactions` 陣列（已排除剛刪除的交易）。
3. 組件重新渲染時重新計算 `initialRootTx`：由於外部傳入的 Props `transactionId` 依舊是剛剛被刪除的交易 ID，在新的 `transactions` 陣列中執行 `find(t => t.id === transactionId)` 必然返回 `undefined`，導致 **`initialRootTx` 瞬間變為 `null`**。
4. 由於 `initialRootTx` 變為 `null`，`relatedRootTransactions` 無法取得 `splitGroupId`，直接退化返回 **空陣列 `[]`**。
5. 負責繪製畫布所有卡片的 `columnsData`（依賴 `relatedRootTransactions`）因此跟著連鎖變為 **空陣列 `[]`**。

---

### 根本原因三：內部切換無法挽救數據源且視圖與遮罩狀態脫節
- 雖然在 [src/components/transactions/TransactionDetailsDialog.tsx](file:///d:/GitHub/Zenance/src/components/transactions/TransactionDetailsDialog.tsx#L890-L895) 的刪除回調中，程式碼嘗試透過 `remainingCols` 找出群組中的下一筆交易並調用 `setActiveTxId(remainingCols[0].rootTx.id)`：
  ```tsx
  await deleteTransaction(activeTxId);
  const remainingCols = columnsData.filter((c) => c.rootTx.id !== activeTxId);
  if (remainingCols.length > 0) {
    setActiveTxId(remainingCols[0].rootTx.id);
  } else {
    onClose();
  }
  ```
- 但因為底層數據構建鏈（`initialRootTx -> relatedRootTransactions -> columnsData`）死鎖在已被刪除的外部 `props.transactionId` 上，即使更新了 `activeTxId`，`columnsData` 依然為 `[]`。
- 中央卡片舞台依賴 `columnsData.map(...)` 渲染，陣列為空導致舞台中央所有主卡片與退款卡片全數卸載蒸發。
- 與此同時，懸浮於底部的 4 欄 Dock Bar（刪除、退款、編輯、關閉）不依賴 `columnsData`，因此依然渲染在底部；外層 `<Dialog open={!!transactionId}>` 亦未被觸發關閉，導致整個頁面被凍結在毛玻璃 Backdrop 遮罩下，中央空無一物。
