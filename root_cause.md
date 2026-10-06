# Root Cause 診斷報告：次級頁面（設置、報表等）首次開啟出現 1-2 秒空白問題

## 1. 故障現象描述

在應用運行過程中，點擊導覽至次級頁面（特別是「報表 `/reports`」與「設置 `/settings`」）時，使用者會觀察到如下現象：
1. **首次開啟顯著延遲**：在首次點擊進入設置或報表頁面時，主內容區域會呈現持續約 1～2 秒的完全空白畫面（深色模式下為純黑背景，淺色模式下為純白背景），隨後頁面內容才突然出現。
2. **與主分頁體驗割裂**：底部導覽列的主分頁（總覽 `/`、預算 `/budgets`、帳戶 `/accounts`、聯絡人 `/contacts`）彼此切換時為瞬間呈現、毫無空白；但次級頁面卻有明顯的空白停頓，無法達到原生 App 的「秒開」質感。

---

## 2. 核心代碼定位

### 關鍵檔案 1：`src/AppRouter.tsx`（第 7～29 行）

```typescript
// 路由級動態代碼分割 (Code Splitting)，徹底卸載非首屏巨型依賴 (如 JSZip、報表等)
const Setup = lazy(() => import('./pages/Setup'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Categories = lazy(() => import('./pages/Categories'));
const ArchivedCategories = lazy(() => import('./pages/ArchivedCategories'));
const CategoryDetails = lazy(() => import('./pages/CategoryDetails'));
const BudgetHistory = lazy(() => import('./pages/BudgetHistory'));
const BudgetDetails = lazy(() => import('./pages/BudgetDetails'));
const AccountDetails = lazy(() => import('./pages/AccountDetails'));
const ContactDetails = lazy(() => import('./pages/ContactDetails'));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground" />
      }
    >
      {children}
    </Suspense>
  );
}
```

### 關鍵檔案 2：`src/components/layout/AppLayout.tsx`（第 4～7 行、第 215～239 行）

```typescript
import Dashboard from '@/pages/Dashboard';
import Budgets from '@/pages/Budgets';
import Accounts from '@/pages/Accounts';
import Contacts from '@/pages/Contacts';
...
// 主 Tab 享有靜態同步載入與 Keep-Alive 視圖常駐：
{mountedTabs.has('/') && (
  <div key={`dash-${activeLedgerId || 'default'}`} style={{ display: location.pathname === '/' ? 'block' : 'none' }}>
    <Dashboard />
  </div>
)}
...
{/* 次級頁面則透過未常駐的 Outlet 渲染，完全依賴 React.lazy 與動態生命週期 */}
{!isCurrentTab && <Outlet />}
```

### 關鍵檔案 3：`src/pages/Settings.tsx` 與 `src/pages/Reports.tsx` 的模組依賴鏈

- `Settings.tsx`（第 4 行）：同步引入重型壓縮庫 `import JSZip from 'jszip'`，並依賴資料庫健康檢查器 `DatabaseHealthModal`、`fsck`、滾動備份管理器、E2EE 加解密層等數十個模組。
- `Reports.tsx`（第 11～29 行）：同步引入 `date-fns` 的 17 個時間計算子模組，以及多個複雜動畫與統計組件。

---

## 3. 根因剖析 (Root Cause Analysis)

### 根本原因 A：路由級 `React.lazy` 動態代碼分割導致的「冷請求延遲 (Cold On-Demand Request)」
- 在 `AppRouter.tsx` 中，為了縮小首屏初始 Bundle 體積，所有次級頁面（`Settings`、`Reports` 等）均被宣告為 `React.lazy(() => import(...))` 動態按需加載。
- 在使用者點擊 Dashboard 上的設置或報表按鈕前，**系統沒有任何預加載（No Preload / No Prefetching）機制**（無論是基於空閒時間 `requestIdleCallback` 還是滑鼠懸停 `onMouseEnter`）。
- **觸發瓶頸**：
  - 在開發環境（Vite 開發伺服器運行時），Vite 採取未打包的 ESM 按需轉換機制。當使用者第一次點擊 `/settings` 或 `/reports` 時，瀏覽器會同時向 Vite 伺服器發起幾十個未打包的模組請求（包括龐大的 `jszip`、`date-fns`、各類 UI 元件及客製化 Hooks），伺服器需即時編譯、轉換並回傳，整個網路與解析耗時達 1 至 2 秒。
  - 在生產環境中，即便打包為單一 Chunk，瀏覽器在點擊當下也必須等待 Chunk 下載並解析完畢後才能開始掛載組件。

### 根本原因 B：`Suspense` 降級容器渲染純空白元素 (Blank Fallback)
- 當 React 遇到未就緒的 `React.lazy` Promise 時，會觸發 `Suspense` 的 fallback 降級渲染。
- `LazyRoute` 的 fallback 目前被指定為：
  ```tsx
  <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground" />
  ```
- 這是一個寬高 100% 但**毫無任何骨架屏 (Skeleton)、加載指示器或結構佔位**的空白 `div`。這使得在前一個視圖卸載後、新頁面代碼就緒前，用戶視野中的主要內容區域完全是一片死寂的純色空白，造成嚴重的「白屏/黑屏卡頓」感知。

### 根本原因 C：次級頁面缺乏視圖層快取（即開即銷毀）
- 4 大主 Tab（總覽、預算、帳戶、聯絡人）在 `AppLayout.tsx` 中採用了靜態引入並結合 `display: none` 的 Keep-Alive 快取結構，生命週期常駐，因而切換時完全秒開。
- 次級頁面則單純透過 `<Outlet />` 渲染，離開次級頁面時組件被立即銷毀（Unmount），返回時即便模組已被記憶體快取，React 仍需重新走完整個組件掛載與資料查詢的流程，未能達到原生應用的即時滑動與記憶體級瞬時響應。
