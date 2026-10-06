# Root Cause 診斷報告：手機端離線狀態下進入應用，右上角離線膠囊提示未顯示

## 1. 故障現象描述

在手機端（iOS / Android）處於完全離線（開啟飛航模式或關閉 Wi-Fi 與行動網路）狀態下點擊開啟 Zenance PWA：
- 應用程式得益於先前修復的 Service Worker 本地預快取機制，能夠順暢開啟並載入首頁（Dashboard）。
- 然而，首頁右上角預期的「離線膠囊提示」（帶有琥珀色脈衝圓點與 `OFFLINE` / `離線` 字樣的徽章）**完全沒有出現**。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`src/hooks/useNetworkStatus.ts`（第 6～25 行）

```typescript
export function useNetworkStatus(): boolean {
  // 缺陷點 1：初始狀態盲目信任 navigator.onLine
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // 缺陷點 2：僅監聽動態切換事件，冷啟動時無事件觸發
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### 關鍵檔案 2：`src/pages/Dashboard.tsx`（第 365～374 行）

```tsx
<div className="flex items-center gap-1.5 -mr-2 shrink-0">
  {/* 依賴 isOnline 控制渲染，當 isOnline 誤判為 true 時整塊被省略 */}
  {!isOnline && (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/40 select-none"
      title={t('common.offline', '離線')}
    >
      <span className="size-1.5 rounded-full bg-amber-500/80 animate-pulse" />
      {t('common.offline', '離線')}
    </span>
  )}
  <Link to="/reports" ...>
  <Link to="/settings" ...>
</div>
```

### 關鍵檔案 3：`src/hooks/useDropboxSync.ts`（第 23 行、89～108 行）

具有完全相同的獨立 `isOnline` 狀態管理機制，同樣僅依賴 `navigator.onLine` 與 `window.addEventListener`。

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：行動端 WebKit / Android PWA 冷啟動時 `navigator.onLine` 存在「預設假在線 (False Positive)」缺陷
1. W3C 規範中 `navigator.onLine` 僅表示「設備是否具有網路配接卡或能力」，而非「是否能實際連通網際網路」。
2. 在 iOS Safari standalone PWA（WebKit 核心）以及部分 Android 系統中，當應用程式處於冷啟動（Cold Boot）時，**WebKit 核心會將 `navigator.onLine` 預設初始化為 `true`**。
3. WebKit 只有在實際發起網路傳輸並遭遇底層 TCP/DNS 握手失敗，或是接收到作業系統廣播的動態網路變更時，才會將其修正為 `false`。

### 根本原因 B：事件監聽機制無法感知「冷啟動前即斷網」的靜態離線狀態
1. `window.addEventListener('offline', ...)` 是瀏覽器的狀態轉移事件（State Transition Event）。
2. **只有當設備在頁面執行期間發生「從連線 ➔ 斷線」的切換時，該事件才會被廣播。**
3. 用戶在測試時，通常是「先將手機切斷網路 / 開啟飛航模式」，然後再「點開 PWA 圖示啟動應用」。
4. 由於進入應用前設備就已經是離線狀態，系統在應用啟動後**完全不會發出任何 `'offline'` 事件**，導致 `handleOffline` 從未被執行。

### 根本原因 C：完全缺乏主動式連通性探針 (Lack of Active Connectivity Probe)
1. 整個應用程式在啟動與掛載過程中，完全沒有任何主動式的網路探針檢測機制。
2. 由於 Service Worker 正確攔截了導航請求，首頁的 HTML、JS、CSS、字體等資源皆在毫秒級由本地 CacheStorage 成功返回（HTTP 200）。
3. 整個渲染過程**完全沒有任何發往外部伺服器的請求遭遇失敗**。
4. 瀏覽器內核始終沒有任何機會發現「當前其實沒有網路」，導致 `useNetworkStatus()` 的內部 state 永遠鎖死在初始值 `true`。
5. 最終導致 `Dashboard.tsx` 中的 `!isOnline` 條件判定為 `false`，離線膠囊節點被 React 徹底跳過，不進行任何渲染。
