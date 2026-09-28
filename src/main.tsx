import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './i18n/config'
import App from './App.tsx'

import { ThemeProvider } from './components/ThemeProvider'
import { requestStoragePersistence } from '@/services/storage/storageManager'

// 自動註冊 PWA Service Worker 實現 100% 離線可用
registerSW({
  immediate: true,
  onOfflineReady() {
    console.log('Zenance is 100% ready to work offline.');
  },
});

// 主動向瀏覽器申請持久化儲存授權，防止 Safari / Chrome 閒置清理 IndexedDB
requestStoragePersistence().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="zenance-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)

// force reload
