import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './i18n/config'
import App from './App.tsx'

import { ThemeProvider } from './components/ThemeProvider'
import { requestStoragePersistence } from '@/services/storage/storageManager'
import { runSilentHealthCheck } from '@/services/fsck'
import { scheduleRollingBackup } from '@/services/storage/opfsBackupService'

// 自動註冊 PWA Service Worker 實現 100% 離線可用
registerSW({
  immediate: true,
  onOfflineReady() {
    console.log('Zenance is 100% ready to work offline.');
  },
});

// 主動向瀏覽器申請持久化儲存授權，防止 Safari / Chrome 閒置清理 IndexedDB
requestStoragePersistence().catch(() => {});

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
)

// force reload
