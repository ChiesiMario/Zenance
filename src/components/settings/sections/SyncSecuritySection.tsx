import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppLockConfig } from '@/store/useAppLockStore';

interface SyncSecuritySectionProps {
  isAuthenticated: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  e2eeActive: boolean;
  e2eeUnlocked: boolean;
  hasCryptoSupport: boolean;
  isLockConfigured: boolean;
  appLockConfig: AppLockConfig | null;
  onOpenDropboxModal: () => void;
  onOpenAppLock: () => void;
}

export function SyncSecuritySection({
  isAuthenticated,
  isSyncing,
  isOnline,
  e2eeActive,
  e2eeUnlocked,
  hasCryptoSupport,
  isLockConfigured,
  appLockConfig,
  onOpenDropboxModal,
  onOpenAppLock,
}: SyncSecuritySectionProps) {
  const { t } = useTranslation();

  const getLockTimeoutLabel = (minutes: number = 0, full: boolean = false) => {
    switch (minutes) {
      case 0:
        return t('security.timeoutImmediately');
      case 1:
        return full ? t('security.timeoutIdleMinutes', { minutes: 1 }) : t('security.timeoutMinutes', { minutes: 1 });
      case 5:
        return full ? t('security.timeoutIdleMinutes', { minutes: 5 }) : t('security.timeoutMinutes', { minutes: 5 });
      case 15:
        return full ? t('security.timeoutIdleMinutes', { minutes: 15 }) : t('security.timeoutMinutes', { minutes: 15 });
      default:
        return full ? t('security.timeoutIdleMinutes', { minutes }) : t('security.timeoutMinutes', { minutes });
    }
  };

  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
        {t('settings.syncSecuritySection', '雲端與安全')}
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
        {/* Dropbox 同步 */}
        <div
          onClick={onOpenDropboxModal}
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-normal text-foreground">{t('settings.dropboxSync')}</span>
          <div className="flex items-center gap-2 text-xs font-mono">
            {!isAuthenticated ? (
              <span className="text-muted-foreground">{t('settings.disconnected')}</span>
            ) : isSyncing ? (
              <span className="text-primary">{t('settings.syncing')}</span>
            ) : !isOnline ? (
              <span className="text-amber-500">{t('common.offline')}</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">{t('settings.connected')}</span>
                {e2eeActive && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span
                      className={cn(
                        "text-[10px] font-sans px-1.5 py-0.5 rounded border leading-none",
                        e2eeUnlocked
                          ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                          : "border-amber-500/30 text-amber-500 bg-amber-500/5"
                      )}
                    >
                      {e2eeUnlocked ? 'E2EE' : t('settings.e2eeLocked', '已鎖定')}
                    </span>
                  </>
                )}
              </div>
            )}
            <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {/* 應用程式安全鎖 */}
        <div
          onClick={onOpenAppLock}
          className={cn(
            "h-12 px-4 flex items-center justify-between transition-colors",
            !hasCryptoSupport
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-muted/40 cursor-pointer group"
          )}
        >
          <span className="text-sm font-normal text-foreground">{t('security.lockSettings')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            {!hasCryptoSupport ? (
              <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
            ) : isLockConfigured ? (
              <span className="text-emerald-500">
                PIN · {getLockTimeoutLabel(appLockConfig?.timeoutMinutes ?? 1)}
              </span>
            ) : (
              <span>{t('security.statusDisabled')}</span>
            )}
            {hasCryptoSupport && (
              <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
