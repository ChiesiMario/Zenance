import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isDropboxConnected,
  initiateDropboxAuth,
  clearDropboxTokens,
  getDropboxAppKey,
} from '@/services/sync/dropboxAuth';
import {
  executeSync,
  getLastSyncTime,
  scheduleAutoSync,
  onSyncUnlockNeeded,
  type SyncResult,
} from '@/services/sync/syncEngine';
import { toast } from '@/components/ui/toast';
import { startInitialSync } from '@/services/sync/initialSyncManager';
import { useAppStore } from '@/store/useAppStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function useDropboxSync() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(isDropboxConnected());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(getLastSyncTime());
  const isOnline = useNetworkStatus();
  const prevIsOnlineRef = useRef(isOnline);



  // E2EE 解鎖彈窗狀態與待恢復的同步模式
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);
  const pendingSyncModeRef = useRef<'auto' | 'overwrite_local' | 'overwrite_remote'>('auto');
  const pendingUnlockRequestedRef = useRef<boolean>(false);

  // 訂閱記帳視窗狀態，保護無邊界大輸入框體驗
  const isAddModalOpen = useAppStore((state) => state.isAddModalOpen);
  const editingTransactionId = useAppStore((state) => state.editingTransactionId);

  const hasHandledAuthRef = useRef(false);

  // 全域訂閱 E2EE 鎖定事件：背景定時同步或任何靜默同步遇到鎖定時，主動呼出彈窗
  useEffect(() => {
    return onSyncUnlockNeeded((mode) => {
      pendingSyncModeRef.current = mode;
      const { isAddModalOpen: isAdding, editingTransactionId: isEditing } = useAppStore.getState();
      if (isAdding || !!isEditing) {
        // 使用者正在記帳或編輯交易中，暫緩彈窗避免打斷輸入體驗
        pendingUnlockRequestedRef.current = true;
      } else {
        setIsUnlockModalOpen(true);
      }
    });
  }, []);

  // 當使用者完成記帳並關閉彈窗時，若有待處理的解鎖請求，平滑補彈
  useEffect(() => {
    if (!isAddModalOpen && !editingTransactionId && pendingUnlockRequestedRef.current) {
      pendingUnlockRequestedRef.current = false;
      setIsUnlockModalOpen(true);
    }
  }, [isAddModalOpen, editingTransactionId]);

  // 應用啟動與切回視窗時主動檢查遠端是否有更新 (感應用戶在其他設備的變更)
  useEffect(() => {
    if (isDropboxConnected() && isOnline) {
      scheduleAutoSync(1500);
    }

    let lastCheckTime = Date.now();
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastCheckTime > 8000 && isDropboxConnected() && isOnline) {
        lastCheckTime = now;
        scheduleAutoSync(1000);
      }
    };

    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 網路恢復時自動補發同步
  useEffect(() => {
    if (!prevIsOnlineRef.current && isOnline) {
      if (isDropboxConnected()) {
        scheduleAutoSync(1000); // 網路恢復 1 秒後自動補發同步
      }
    }
    prevIsOnlineRef.current = isOnline;
  }, [isOnline]);

  // 首次載入偵測 OAuth 回調代碼 (?code=...)
  useEffect(() => {
    if (hasHandledAuthRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      hasHandledAuthRef.current = true;
      // 乾淨移除網址上的授權碼參數
      window.history.replaceState({}, document.title, window.location.pathname);

      // 啟動事務性首次同步狀態機與固定進度窗口
      startInitialSync(code).catch((err) => {
        console.error('Failed to start initial sync:', err);
      });
    }
  }, []);

  // 發起連線
  const connectDropbox = useCallback(async () => {
    const appKey = getDropboxAppKey();
    if (!appKey) {
      toast.show('未配置 Dropbox App Key，請先於環境設定 VITE_DROPBOX_APP_KEY');
      return;
    }

    try {
      await initiateDropboxAuth();
    } catch (err: any) {
      console.error('Failed to initiate Dropbox auth:', err);
      toast.show('無法發起授權：' + (err?.message || '未知錯誤'));
    }
  }, []);

  // 中斷連線 (登出)
  const disconnectDropbox = useCallback(() => {
    clearDropboxTokens();
    setIsAuthenticated(false);
    toast.show('已中斷與 Dropbox 的連結');
  }, []);

  // 手動點擊立即同步 (支援指定模式：auto, overwrite_remote, overwrite_local)
  const syncNow = useCallback(
    async (
      mode: 'auto' | 'overwrite_local' | 'overwrite_remote' = 'auto'
    ): Promise<SyncResult> => {
      if (isSyncing) {
        return { success: false, timestamp: new Date().toISOString(), actionTaken: 'up_to_date' };
      }

      if (!navigator.onLine) {
        toast.show('目前處於離線狀態，將於連線後自動同步');
        return { success: false, timestamp: new Date().toISOString(), actionTaken: 'up_to_date' };
      }

      setIsSyncing(true);
      try {
        const result = await executeSync(mode);
        if (result.success) {
          setLastSyncTime(getLastSyncTime());
          if (mode === 'overwrite_remote') {
            toast.show('雲端所有備份已全數加密更新完成');
          } else {
            toast.show('同步完成');
          }
        } else if (result.needsUnlock || result.error === 'E2EE_LOCKED' || result.error === 'E2EE_DECRYPT_FAILED') {
          pendingSyncModeRef.current = mode;
          setIsUnlockModalOpen(true);
        } else {
          toast.show('同步未完成：' + (result.error || '請重試'));
        }
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [isSyncing]
  );

  // 解鎖成功後自動恢復被中斷的同步任務
  const handleUnlockSuccess = useCallback(async () => {
    setIsUnlockModalOpen(false);
    setIsSyncing(true);
    try {
      const mode = pendingSyncModeRef.current;
      const res = await executeSync(mode);
      if (res.success) {
        setLastSyncTime(getLastSyncTime());
        toast.show('E2EE 已解鎖，同步完成');
      } else {
        toast.show('同步未完成：' + (res.error || '請重試'));
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);



  return {
    isAuthenticated,
    isSyncing,
    lastSyncTime,
    isOnline,
    isUnlockModalOpen,
    setIsUnlockModalOpen,
    handleUnlockSuccess,
    connectDropbox,
    disconnectDropbox,
    syncNow,
  };
}
