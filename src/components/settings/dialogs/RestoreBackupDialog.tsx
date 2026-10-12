import { useTranslation } from 'react-i18next';
import { GitMerge, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { ParsedBackup } from '../types';

interface RestoreBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingBackup: ParsedBackup | null;
  isRestoring: boolean;
  onExecuteRestore: (mode: 'merge' | 'overwrite') => Promise<void>;
}

export function RestoreBackupDialog({
  open,
  onOpenChange,
  pendingBackup,
  isRestoring,
  onExecuteRestore,
}: RestoreBackupDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {t('settings.restoreDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('settings.restoreFoundLedgers', {
              count: pendingBackup?.ledgersData.length ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* 辨識到的帳本清單 */}
        <div className="max-h-[180px] overflow-y-auto border border-border rounded-lg bg-card divide-y divide-border">
          {pendingBackup?.ledgersData.map(
            ({ ledger, transactions: txs, accounts: accs, categories: cats }) => (
              <div key={ledger.id} className="p-3 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                    <span>{ledger.name}</span>
                    {ledger.isDefault && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono tracking-wider">
                        Default
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{ledger.baseCurrency}</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {t('settings.restoreSummary', {
                    txCount: txs?.length ?? 0,
                    accCount: accs?.length ?? 0,
                    catCount: cats?.length ?? 0,
                  })}
                </div>
              </div>
            )
          )}
        </div>

        {/* 雙卡片模式選擇：累加合併 (Merge) vs 完整覆蓋 (Overwrite) */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isRestoring}
            onClick={() => onExecuteRestore('merge')}
            className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/40 transition-colors text-left flex items-start gap-3 cursor-pointer group"
          >
            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <GitMerge className="size-4 text-foreground" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground flex items-center justify-between">
                <span>{t('settings.restoreMergeTitle')}</span>
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  {t('settings.recommended')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                {t('settings.restoreMergeDesc')}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={isRestoring}
            onClick={() => onExecuteRestore('overwrite')}
            className="w-full p-3 rounded-lg border border-destructive/30 hover:bg-destructive/5 hover:border-destructive/60 transition-colors text-left flex items-start gap-3 cursor-pointer group"
          >
            <div className="size-8 rounded-md bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="size-4 text-destructive" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-destructive">
                {t('settings.restoreOverwriteTitle')}
              </div>
              <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                {t('settings.restoreOverwriteDesc')}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
