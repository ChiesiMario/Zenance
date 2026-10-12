import { useTranslation } from 'react-i18next';
import { History, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { RollingSnapshotItem } from '@/services/storage/opfsBackupService';

interface TimeMachineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: RollingSnapshotItem[];
  isBackingUp: boolean;
  isOpfsSupported: boolean;
  onTriggerBackup: (manual?: boolean) => Promise<boolean>;
  onExportSnapshot: (filename: string) => void;
  onRestoreSnapshot: (filename: string) => void;
}

export function TimeMachineDialog({
  open,
  onOpenChange,
  snapshots,
  isBackingUp,
  isOpfsSupported,
  onTriggerBackup,
  onExportSnapshot,
  onRestoreSnapshot,
}: TimeMachineDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <History className="size-5 text-primary" />
            <span>{t('settings.timeMachineModalTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('settings.timeMachineModalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
          {snapshots.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground font-sans">
              {t('settings.noSnapshotsYet')}
            </div>
          ) : (
            snapshots.map((snap) => (
              <div key={snap.id} className="p-3 flex items-center justify-between">
                <div>
                  <span className="font-sans font-medium text-foreground block">
                    {snap.id === 'daily'
                      ? t('settings.snapshotDaily')
                      : snap.id === 'weekly'
                      ? t('settings.snapshotWeekly')
                      : snap.id === 'monthly'
                      ? t('settings.snapshotMonthly')
                      : snap.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {snap.date} · {snap.sizeFormatted}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onExportSnapshot(snap.filename)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                  >
                    {t('settings.exportAction')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onRestoreSnapshot(snap.filename);
                    }}
                    className="text-emerald-500 hover:underline cursor-pointer text-xs font-medium"
                  >
                    {t('settings.restoreAction')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs cursor-pointer gap-1.5"
            disabled={isBackingUp || !isOpfsSupported}
            onClick={async () => {
              const ok = await onTriggerBackup(true);
              toast.show(ok ? t('settings.snapshotSuccess') : t('settings.snapshotFailed'));
            }}
          >
            <RefreshCw className={cn("size-3.5", isBackingUp && "animate-spin")} />
            <span>{t('settings.createSnapshotNow')}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
