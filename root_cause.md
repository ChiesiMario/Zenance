# Root Cause 診斷報告：PWA 離線模式下啟動直接被瀏覽器提示「無網絡，無法打開網頁」

## 1. 故障現象描述

在手機端將 Zenance 安裝為 PWA 或直接訪問後，於離線（關閉 Wi-Fi / 行動網路 / 開啟飛航模式）狀態下點擊開啟應用，瀏覽器未呈現任何本地快取的應用內容，而是直接彈出系統原生的錯誤畫面：
> **「無網絡，無法打開網頁」**（Chrome 的 ERR_INTERNET_DISCONNECTED / Safari 的「無法打開網頁，因為您的 iPhone 未連接到互聯網」）。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`vite.config.ts`（第 41～53 行）

```typescript
workbox: {
  globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  navigateFallback: '/index.html',
  navigateFallbackAllowlist: [/^(?!\/__).*/],
  runtimeCaching: [
    {
      // 致命衝突點：自定義的 NetworkFirst 搶先攔截了導航請求
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'zenance-nav-cache',
        networkTimeoutSeconds: 1.5,
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
},
```

### 關鍵檔案 2：`dist/sw.js`（Workbox 編譯後的路由註冊順序）

```javascript
// 路由 1：Workbox 的預快取導航回退
e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"),{allowlist:[/^(?!\/__).*/]}));

// 路由 2：手動添加的 NetworkFirst 運行時快取規則
e.registerRoute(({request:e})=>"navigate"===e.mode, new e.NetworkFirst({cacheName:"zenance-nav-cache",networkTimeoutSeconds:1.5,...}), "GET");
```

### 關鍵檔案 3：`src/main.tsx`（第 17～33 行）

```typescript
// 本機開發環境 (npm run dev) 主動清理並註銷殘留的 Service Worker
if (import.meta.env.DEV) {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister(); // <--- 開發模式下主動註銷所有 SW
      }
    });
  }
} else {
  registerSW({
    immediate: true,
    ...
  });
}
```

---

## 3. 根因剖析 (Root Cause Analysis)

經過對 PWA Service Worker 路由匹配鏈、快取分區與測試運行環境的深入排查，導致離線時直接跳出原生「無網絡」錯誤頁面的根因如下：

### 根本原因 A：Workbox `runtimeCaching` 劫持導航請求，引發獨立快取擊穿 (Runtime Navigation Cache Miss & Exception)
1. **快取存儲分區隔離**：
   - Workbox 將 `globPatterns` 匹配的所有構建產物（包括 `/index.html`、JS、CSS 等）存放在專屬的 **預快取池 (Precache Storage，如 `workbox-precache-v2-...`)** 中。
   - 在 `vite.config.ts` 中配置的 `runtimeCaching` 規則則指定了獨立的運行時快取池 `cacheName: 'zenance-nav-cache'`。
2. **命中失敗與例外拋出**：
   - 當手機在離線狀態下發起導航請求（開啟 PWA）時，`request.mode === 'navigate'` 匹配到了自定義的 `NetworkFirst` 規則。
   - `NetworkFirst` 首先發起網路請求，因離線而立刻失敗；緊接著在 `zenance-nav-cache` 中尋找請求對應的快取回應。
   - **此時 `zenance-nav-cache` 中根本沒有 `/index.html`**（因為它一直存在於預快取池中，而非該運行時快取池）。
   - 當網路與快取皆未命中時，Workbox 底層的 `NetworkFirst` 策略會直接拋出 `no-response` 致命異常（Unhandled Promise Rejection）。
3. **瀏覽器接管報錯**：
   - 由於 Service Worker 的 `fetch` 事件拋出異常且未返回有效的 `Response`，Service Worker 處理流程崩潰。
   - 這導致 Workbox 原生的 `NavigationRoute`（`createHandlerBoundToURL('/index.html')`）無法正常發揮作用，瀏覽器底層判定請求失敗，直接降級呈現系統原生的「無網絡，無法打開網頁」頁面。

---

### 根本原因 B：本機開發環境 (`npm run dev`) 下 Service Worker 完全未生效 (Dev Mode SW Disabled)
若使用者是在目前執行的 `npm run dev` 環境下（例如透過區域網路 IP `http://192.168.x.x:3011` 在手機端打開並測試）：
1. **主動註銷邏輯**：[`src/main.tsx`](file:///d:/GitHub/Zenance/src/main.tsx) 中明確限制了 `if (import.meta.env.DEV)` 會遍歷並**主動註銷 (unregister) 所有 Service Worker**，且不會調用 `registerSW()`。
2. **非安全上下文限制 (Insecure Context)**：手機若透過 HTTP 內網 IP 訪問，瀏覽器會判定其為非 HTTPS 不安全來源，原生層級即完全禁止啟用 Service Worker。
3. 在沒有任何 Service Worker 攔截與背景託管的情況下，手機一旦離線刷新，瀏覽器勢必直接顯示「無網絡」錯誤。
