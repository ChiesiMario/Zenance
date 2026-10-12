import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntegrityReport } from '@/services/fsck';
import type { RollingSnapshotItem } from '@/services/storage/opfsBackupService';

interface DataVaultSectionProps {
  healthReport: IntegrityReport | null;
  isSecureEnv: boolean;
  isPersisted: boolean | null;
  estimate: { usageFormatted: string } | null;
  isOpfsSupported: boolean;
  opfsSnapshots: RollingSnapshotItem[];
  onOpenHealthModal: () => void;
  onRequestPersistence: () => void;
  onOpenTimeMachineModal: () => void;
  onExportData: () => void;
  onRequestImportFile: () => void;
}

export function DataVaultSection({
  healthReport,
  isSecureEnv,
  isPersisted,
  estimate,
  isOpfsSupported,
  opfsSnapshots,
  onOpenHealthModal,
  onRequestPersistence,
  onOpenTimeMachineModal,
  onExportData,
  onRequestImportFile,
}: DataVaultSectionProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
        {t('settings.dataVaultSection', '資料與儲存')}
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
        {/* 資料庫健康自檢 (FSCK) */}
        <div
          onClick={onOpenHealthModal}
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-normal text-foreground">{t('fsck.title')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            {healthReport ? (
              healthReport.score === 100 ? (
                <span className="text-emerald-500">{t('fsck.scoreGood')}</span>
              ) : (
                <span className="text-amber-500">
                  {t('fsck.scoreNeedRepair', { score: healthReport.score })}
                </span>
              )
            ) : (
              <span>{t('fsck.checkNow')}</span>
            )}
            <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* 持久化存儲 */}
        <div
          onClick={onRequestPersistence}
          className={cn(
            "h-12 px-4 flex items-center justify-between transition-colors",
            !isSecureEnv
              ? "opacity-60 cursor-not-allowed"
              : !isPersisted && "cursor-pointer hover:bg-muted/40"
          )}
        >
          <span className="text-sm font-normal text-foreground">{t('settings.persistenceProtection')}</span>
          <div className="flex items-center gap-2 text-xs font-mono">
            {!isSecureEnv ? (
              <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
            ) : isPersisted ? (
              <span className="text-emerald-500">{t('settings.persistenceProtected')}</span>
            ) : (
              <span className="text-amber-500">{t('settings.requestPersistence')}</span>
            )}
            {isSecureEnv && estimate && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">{estimate.usageFormatted}</span>
              </>
            )}
          </div>
        </div>

        {/* 本機時光機快照 */}
        <div
          onClick={onOpenTimeMachineModal}
          className={cn(
            "h-12 px-4 flex items-center justify-between transition-colors",
            !isSecureEnv || !isOpfsSupported
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-muted/40 cursor-pointer group"
          )}
        >
          <span className="text-sm font-normal text-foreground">{t('settings.timeMachineBackup')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            {!isSecureEnv || !isOpfsSupported ? (
              <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
            ) : (
              <span>{t('settings.snapshotsCount', { count: opfsSnapshots.length })}</span>
            )}
            {isSecureEnv && isOpfsSupported && (
              <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>

        {/* 匯出備份 */}
        <div
          onClick={onExportData}
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-normal text-foreground">{t('settings.exportData')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            <span>ZIP</span>
            <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* 匯入還原 */}
        <div
          onClick={onRequestImportFile}
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-normal text-foreground">{t('settings.importData')}</span>
          <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </div>
  );
}
