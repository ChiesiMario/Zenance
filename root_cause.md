# Root Cause 診斷報告：刷新頁面時出現一瞬間的 Z 圖標

## 1. 故障現象描述

在瀏覽器或 PWA 環境中手動刷新頁面（F5 / Cmd+R / 重新載入）時，畫面中央會瞬間閃現一個帶有淡色圓角矩形背景與呼吸動畫的「Z」字標誌，隨後立即消失並顯示正式的應用程式介面（如 Dashboard 或鎖定畫面）。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`index.html`（第 49～98 行、第 121～131 行）

```html
<!-- 樣式定義 -->
<style>
  #app-shell-fallback {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: var(--app-bg);
    user-select: none;
    -webkit-user-select: none;
  }
  .app-shell-icon {
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.9;
    animation: appShellPulse 2s ease-in-out infinite;
  }
  @keyframes appShellPulse {
    0%, 100% { opacity: 0.9; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.97); }
  }
  ...
</style>

<!-- 骨架屏 DOM 結構 -->
<div id="root">
  <div id="app-shell-fallback">
    <div class="app-shell-icon">
      <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="14" fill="currentColor" fill-opacity="0.08"/>
        <path d="M15 16H33L15 32H33" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div id="app-shell-status"></div>
  </div>
</div>
```

### 關鍵檔案 2：`src/main.tsx`（第 55～66 行）

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="zenance-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
);

// 平滑關閉 PWA 首屏看門狗
if (typeof (window as any).__dismissAppShell === 'function') {
  (window as any).__dismissAppShell();
}
```

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：這是專案的「PWA 靜態首屏骨架屏 (App Shell Fallback)」機制
1. 在單頁應用（SPA / PWA）架構中，JavaScript bundle（包含 React 核心庫、路由、頁面組件、狀態管理等）在頁面剛開啟時需要經過瀏覽器的下載、解析與執行階段。
2. 為了避免在 JavaScript 尚未就緒前使用者看到純白畫面（White Screen of Death），專案在 `index.html` 的容器 `<div id="root">` 內部直接內嵌了原生 HTML 與 SVG 構成的「Z」字圖標，作為應用的 Splash Screen / 載入過渡畫面。

### 根本原因 B：瀏覽器首屏渲染與 React 掛載接管的時間差
1. **首幀即時繪製 (First Contentful Paint, FCP)**：
   當使用者刷新頁面時，瀏覽器首先解析 `index.html`。由於該圖標是純靜態的內聯 HTML/CSS/SVG，瀏覽器無須等待任何外部腳本即可在首幀直接繪製該骨架屏。
2. **React 掛載與 DOM 覆蓋 (React Mount & DOM Replacement)**：
   隨後，瀏覽器完成 `/src/main.tsx` 腳本的載入與執行，觸發 `createRoot(document.getElementById('root')!).render(...)`。此時 React 會清空並接管 `<div id="root">` 內的原生 DOM 節點，將 `#app-shell-fallback` 徹底替換為真實的 React 元件樹。
3. **極短的過渡時間造成視覺上的「瞬間閃爍」**：
   在現代硬體或本機開發環境下，JavaScript bundle 的載入與執行通常僅需數十毫秒至百餘毫秒。骨架屏剛被繪製出來，React 便立即掛載完成並將其替換掉，因此在視覺上呈現為「刷新頁面時出現一瞬間的 Z 圖標」。
