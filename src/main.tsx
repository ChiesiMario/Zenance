import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import './i18n/config'
import App from './App.tsx'

import { ThemeProvider } from './components/ThemeProvider'
import { requestStoragePersistence } from '@/services/storage/storageManager'
import { runSilentHealthCheck } from '@/services/fsck'
import { scheduleRollingBackup } from '@/services/storage/opfsBackupService'

// 在生產環境自動註冊 PWA Service Worker 實現 100% 離線可用；
// 在本機開發環境 (npm run dev) 主動清理並註銷殘留的 Service Worker，避免 HMR/ESM 請求被攔截導致死鎖
if (import.meta.env.DEV) {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
} else {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('Zenance is 100% ready to work offline.');
    },
  });
}

// 主動向瀏覽器申請持久化儲存授權，防止 Safari / Chrome 閒置清理 IndexedDB
setTimeout(() => {
  requestStoragePersistence().catch(() => {});
}, 1500);

// 背景閒置時定期執行低優先級數據自檢與自癒 (每 7 天至多一次)
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      runSilentHealthCheck();
    }, { timeout: 10000 });
  } else {
    setTimeout(() => {
      runSilentHealthCheck();
    }, 4000);
  }
}

// 啟動閒置時檢查並執行 GFS 三級輪換本機自動滾動冷備份 (每日最多 1 次)
scheduleRollingBackup(10000);

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

// 修復 iOS Safari/PWA 虛擬鍵盤或輸入框聚焦引發的 visualViewport 殘留偏移導致點擊錯位
if (typeof window !== 'undefined') {
  document.addEventListener('focusout', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50);
    }
  });
}
