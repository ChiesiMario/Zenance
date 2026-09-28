import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isDropboxConnected,
  initiateDropboxAuth,
  exchangeCodeForTokens,
  clearDropboxTokens,
  getDropboxAppKey,
} from '@/services/sync/dropboxAuth';
import {
  executeSync,
  getLastSyncTime,
  scheduleAutoSync,
  type SyncResult,
  type SyncManifest,
} from '@/services/sync/syncEngine';
import { downloadJsonFile } from '@/services/sync/dropboxClient';
import { db } from '@/services/db/db';
import { toast } from '@/components/ui/toast';

export function useDropboxSync() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(isDropboxConnected());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(getLastSyncTime());
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // 首次授權且兩端皆有資料時的確認彈窗狀態
  const [firstConnectModalOpen, setFirstConnectModalOpen] = useState<boolean>(false);
  const [localRecordCount, setLocalRecordCount] = useState<number>(0);
  const [remoteRecordCount, setRemoteRecordCount] = useState<number>(0);

  const hasHandledAuthRef = useRef(false);

  // 監聽連網/離線狀態
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (isDropboxConnected()) {
        scheduleAutoSync(1000); // 網路恢復 1 秒後自動補發同步
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 首次載入偵測 OAuth 回調代碼 (?code=...)
  useEffect(() => {
    if (hasHandledAuthRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      hasHandledAuthRef.current = true;
      // 乾淨移除網址上的授權碼參數
      window.history.replaceState({}, document.title, window.location.pathname);

      (async () => {
        setIsSyncing(true);
        try {
          await exchangeCodeForTokens(code);
          setIsAuthenticated(true);
          toast.show('Dropbox 連結成功！');

          // 檢測首次連線衝突：本機是否有資料？雲端是否有資料夾同步檔？
          const localCount = await db.transactions.filter(t => !t.deleted).count();
          const remoteManifest = await downloadJsonFile<SyncManifest>('/manifest.json');
          const remoteCount =
            remoteManifest?.ledgers?.reduce((sum, l) => sum + (l.stats?.transactionsCount || 0), 0) || 0;

          if (localCount > 0 && remoteCount > 0) {
            // 兩端皆有歷史資料，觸發 Q1 選項 B 互動確認彈窗
            setLocalRecordCount(localCount);
            setRemoteRecordCount(remoteCount);
            setFirstConnectModalOpen(true);
          } else {
            // 其中一方為空，自動靜默雙向同步
            const res = await executeSync('auto');
            if (res.success) {
              setLastSyncTime(getLastSyncTime());
            }
          }
        } catch (err: any) {
          console.error('Dropbox auth callback failed:', err);
          toast.show('Dropbox 授權失敗：' + (err?.message || '未知錯誤'));
        } finally {
          setIsSyncing(false);
        }
      })();
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

  // 處理首次連線衝突彈窗用戶決策
  const resolveFirstConnectConflict = useCallback(
    async (decision: 'merge' | 'overwrite_local' | 'overwrite_remote') => {
      setFirstConnectModalOpen(false);
      setIsSyncing(true);
      try {
        const res = await executeSync(decision === 'merge' ? 'auto' : decision);
        if (res.success) {
          setLastSyncTime(getLastSyncTime());
          toast.show('初始同步已完成');
        } else {
          toast.show('同步失敗：' + (res.error || '請重試'));
        }
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  return {
    isAuthenticated,
    isSyncing,
    lastSyncTime,
    isOnline,
    firstConnectModalOpen,
    setFirstConnectModalOpen,
    localRecordCount,
    remoteRecordCount,
    connectDropbox,
    disconnectDropbox,
    syncNow,
    resolveFirstConnectConflict,
  };
}
