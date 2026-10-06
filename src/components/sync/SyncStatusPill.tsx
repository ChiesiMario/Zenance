import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Loader2 } from 'lucide-react';
import { cn, format24Time } from '@/lib/utils';
import { useNetworkStatus, checkConnectivity } from '@/hooks/useNetworkStatus';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { isE2EEEnabled, isE2EEUnlocked } from '@/services/crypto/e2eeManager';
import { triggerSyncUnlockNeeded } from '@/services/sync/syncEngine';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function SyncStatusPill() {
  const { t } = useTranslation();
  const isOnline = useNetworkStatus();
  const {
    isAuthenticated,
    isSyncing,
    lastSyncTime,
    lastSyncError,
    justSynced,
    connectDropbox,
    syncNow,
  } = useDropboxSync();

  const [isConnectOpen, setIsConnectOpen] = useState(false);

  // 判斷 E2EE 是否已開啟但尚未解鎖金鑰
  const isLocked = isAuthenticated && isE2EEEnabled() && !isE2EEUnlocked();

  // 計算當前膠囊狀態優先級：
  // 1. 離線 (最高優先級，覆蓋所有在線狀態)
  // 2. 同步中
  // 3. 未連接 Dropbox
  // 4. E2EE 已鎖定
  // 5. 同步失敗
  // 6. 剛同步成功
  // 7. 已連接閒置
  type PillStatus = 'offline' | 'syncing' | 'disconnected' | 'locked' | 'failed' | 'synced' | 'connected';

  let status: PillStatus = 'connected';
  if (!isOnline) {
    status = 'offline';
  } else if (isSyncing) {
    status = 'syncing';
  } else if (!isAuthenticated) {
    status = 'disconnected';
  } else if (isLocked) {
    status = 'locked';
  } else if (lastSyncError) {
    status = 'failed';
  } else if (justSynced) {
    status = 'synced';
  } else {
    status = 'connected';
  }

  const handleClick = async () => {
    switch (status) {
      case 'offline': {
        toast.show(t('syncStatus.reconnectingToast'));
        const online = await checkConnectivity();
        if (!online) {
          toast.show(t('syncStatus.offlineToast'));
        }
        break;
      }
      case 'syncing':
        // 同步中禁止重複觸發
        break;
      case 'disconnected':
        setIsConnectOpen(true);
        break;
      case 'locked':
        triggerSyncUnlockNeeded('auto');
        break;
      case 'failed':
        toast.show(t('syncStatus.retryToast'));
        await syncNow();
        break;
      case 'synced':
      case 'connected':
        await syncNow();
        break;
    }
  };

  // 生成狀態對應文字
  const getLabel = () => {
    switch (status) {
      case 'offline':
        return t('syncStatus.offline');
      case 'syncing':
        return t('syncStatus.syncing');
      case 'disconnected':
        return t('syncStatus.disconnected');
      case 'locked':
        return t('syncStatus.locked');
      case 'failed':
        return t('syncStatus.failed');
      case 'synced':
        return t('syncStatus.synced');
      case 'connected':
        return t('syncStatus.connected');
    }
  };

  // 生成 title 輔助說明
  const getTitle = () => {
    switch (status) {
      case 'offline':
        return t('syncStatus.offlineToast');
      case 'syncing':
        return t('syncStatus.syncing');
      case 'disconnected':
        return t('syncStatus.connectDialogTitle');
      case 'locked':
        return t('syncStatus.locked');
      case 'failed':
        return lastSyncError ? `${t('syncStatus.failed')}: ${lastSyncError}` : t('syncStatus.retryAction');
      case 'synced':
      case 'connected':
        if (lastSyncTime) {
          return `${t('syncStatus.lastSyncPrefix')}: ${format24Time(lastSyncTime, true)} · ${t('syncStatus.syncNowAction')}`;
        }
        return t('syncStatus.syncNowAction');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'syncing'}
        title={getTitle()}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider select-none transition-all outline-none",
          status === 'syncing'
            ? "cursor-not-allowed opacity-80 border-border bg-muted/40 text-foreground"
            : "cursor-pointer active:scale-[0.97] hover:bg-muted/70",
          status === 'offline' && "border-border text-muted-foreground bg-muted/40",
          status === 'disconnected' && "border-border text-muted-foreground bg-muted/30 hover:text-foreground",
          status === 'locked' && "border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
          status === 'failed' && "border-destructive/40 text-destructive bg-destructive/10 hover:bg-destructive/20",
          (status === 'connected' || status === 'synced') && "border-border text-muted-foreground hover:text-foreground bg-muted/40"
        )}
      >
        {/* 狀態指示燈 */}
        {status === 'syncing' ? (
          <Loader2 className="size-2.5 animate-spin text-foreground shrink-0" />
        ) : status === 'offline' ? (
          <span className="size-1.5 rounded-full bg-amber-500/80 animate-pulse shrink-0" />
        ) : status === 'locked' ? (
          <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
        ) : status === 'failed' ? (
          <span className="size-1.5 rounded-full bg-destructive shrink-0" />
        ) : status === 'disconnected' ? (
          <span className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
        ) : (
          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
        )}

        <span>{getLabel()}</span>
      </button>

      {/* 連接 Dropbox 獨立彈窗 (平級兄弟節點聲明，遵守 ui-guidelines 規範) */}
      <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
        <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4 shadow-none">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Cloud className="size-5 text-foreground shrink-0" />
              <span>{t('syncStatus.connectDialogTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed text-left">
              {t('syncStatus.connectDialogDesc')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between pt-2">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setIsConnectOpen(false);
                connectDropbox();
              }}
            >
              {t('syncStatus.connectAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
