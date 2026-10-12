import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  RefreshCw,
  Plus,
  Lock,
  ArrowLeft,
  KeyRound,
  Check,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { DropboxModalView } from '../types';

interface DropboxSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAuthenticated: boolean;
  isSyncing: boolean;
  lastSyncTime?: number | string | Date | null;
  isOnline: boolean;
  hasCryptoSupport: boolean;
  e2eeActive: boolean;
  e2eeUnlocked: boolean;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onSyncNow: () => Promise<unknown>;
  onEnableE2EE: (passphrase: string) => Promise<string>;
  onDisableE2EE: () => Promise<unknown>;
  onUnlockE2EE: () => Promise<unknown>;
}

export function DropboxSyncDialog({
  open,
  onOpenChange,
  isAuthenticated,
  isSyncing,
  lastSyncTime,
  isOnline,
  hasCryptoSupport,
  e2eeActive,
  e2eeUnlocked,
  onConnectDropbox,
  onDisconnectDropbox,
  onSyncNow,
  onEnableE2EE,
  onDisableE2EE,
  onUnlockE2EE,
}: DropboxSyncDialogProps) {
  const { t } = useTranslation();

  const [view, setView] = useState<DropboxModalView>('overview');
  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [e2eeConfirmPassphrase, setE2eeConfirmPassphrase] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [isRecoveryCopied, setIsRecoveryCopied] = useState(false);

  const format24Time = (timestamp: number | string | Date, includeSeconds = false) => {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    if (includeSeconds) {
      return `${hh}:${mm}:${pad(d.getSeconds())}`;
    }
    return `${hh}:${mm}`;
  };

  const handleEnableE2EE = async () => {
    if (!e2eePassphrase.trim() || e2eePassphrase.length < 6) {
      toast.show(t('settings.e2eeMinLength'));
      return;
    }
    if (e2eePassphrase !== e2eeConfirmPassphrase) {
      toast.show(t('settings.e2eeMismatch'));
      return;
    }
    try {
      const recoveryKey = await onEnableE2EE(e2eePassphrase);
      setGeneratedRecoveryKey(recoveryKey);
      setView('recovery_key');
      toast.show(t('settings.e2eeEnabledSuccess'));
    } catch (err: any) {
      toast.show(t('settings.e2eeEnableFailed') + (err?.message || ''));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setView('overview');
          setE2eePassphrase('');
          setE2eeConfirmPassphrase('');
          setGeneratedRecoveryKey('');
        }
      }}
    >
      <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
        {view === 'overview' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Cloud className="size-5 text-primary" />
                <span>{t('settings.dropboxSyncModalTitle')}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
              {/* 連線狀態 */}
              <div className="p-3 flex justify-between items-center">
                <span className="text-muted-foreground font-sans">{t('settings.status')}</span>
                <span className={isAuthenticated ? "text-emerald-500 font-medium" : "text-muted-foreground"}>
                  {isAuthenticated ? t('settings.connected') : t('settings.disconnected')}
                </span>
              </div>

              {/* 上次同步 */}
              {isAuthenticated && (
                <div className="p-3 flex justify-between items-center">
                  <span className="text-muted-foreground font-sans">{t('settings.lastSync')}</span>
                  <span className="text-foreground">
                    {lastSyncTime ? format24Time(lastSyncTime, true) : t('settings.never')}
                  </span>
                </div>
              )}

              {/* 端到端加密 E2EE */}
              <div className="p-3 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-muted-foreground font-sans">{t('settings.e2ee')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!hasCryptoSupport ? (
                    <span className="text-amber-500/80 font-sans">{t('security.requiresHttps')}</span>
                  ) : !isAuthenticated ? (
                    <span className="text-muted-foreground/60 font-sans">
                      {t('settings.requiresCloudSync', '需連線雲端')}
                    </span>
                  ) : !e2eeActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setE2eePassphrase('');
                        setE2eeConfirmPassphrase('');
                        setGeneratedRecoveryKey('');
                        setView('enable_e2ee');
                      }}
                      className="h-6 px-2.5 inline-flex items-center gap-1 text-[11px] font-sans rounded-full border border-border bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer group/pill"
                    >
                      <Plus className="size-3 text-muted-foreground group-hover/pill:text-foreground transition-colors" />
                      <span>{t('settings.enableAction', '啟用')}</span>
                    </button>
                  ) : !e2eeUnlocked ? (
                    <button
                      type="button"
                      onClick={onUnlockE2EE}
                      className="h-6 px-2.5 inline-flex items-center gap-1 text-[11px] font-sans rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      <Lock className="size-3" />
                      <span>{t('settings.unlockAction', '解鎖')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onDisableE2EE}
                      className="h-6 px-2.5 inline-flex items-center gap-1.5 text-[11px] font-sans rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer group/pill"
                      title={t('settings.clickToDisableE2ee', '點擊停用端到端加密')}
                    >
                      <span className="size-1.5 rounded-full bg-emerald-500 group-hover/pill:bg-destructive transition-colors shrink-0" />
                      <span className="font-mono">AES-256</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {!isAuthenticated ? (
                <Button
                  className="w-full h-9 text-xs cursor-pointer"
                  disabled={isSyncing}
                  onClick={() => {
                    onOpenChange(false);
                    onConnectDropbox();
                  }}
                >
                  {t('settings.connectDropbox')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs cursor-pointer"
                    disabled={isSyncing || !isOnline}
                    onClick={onSyncNow}
                  >
                    <RefreshCw className={cn("size-3.5 mr-1.5", isSyncing && "animate-spin")} />
                    <span>{isSyncing ? t('settings.syncing') : t('settings.syncNow')}</span>
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 h-9 text-xs cursor-pointer"
                    disabled={isSyncing}
                    onClick={() => {
                      onOpenChange(false);
                      onDisconnectDropbox();
                    }}
                  >
                    {t('settings.disconnect')}
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        {view === 'enable_e2ee' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView('overview')}
                  className="size-7 -ml-1 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Back"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <KeyRound className="size-5 text-primary" />
                  <span>{t('settings.enableE2eeTitle')}</span>
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                {t('settings.enableE2eeDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t('settings.e2eePassphraseLabel')}
                </label>
                <Input
                  type="password"
                  placeholder={t('settings.e2eePassphrasePlaceholder')}
                  value={e2eePassphrase}
                  onChange={(e) => setE2eePassphrase(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t('settings.confirmE2eePassphraseLabel')}
                </label>
                <Input
                  type="password"
                  placeholder={t('settings.confirmE2eePassphrasePlaceholder')}
                  value={e2eeConfirmPassphrase}
                  onChange={(e) => setE2eeConfirmPassphrase(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs cursor-pointer"
                  onClick={() => setView('overview')}
                >
                  {t('common.cancel')}
                </Button>
                <Button className="flex-1 h-9 text-xs cursor-pointer" onClick={handleEnableE2EE}>
                  {t('settings.enableNow')}
                </Button>
              </div>
            </div>
          </>
        )}

        {view === 'recovery_key' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                <span>{t('settings.recoveryKeyTitle')}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                {t('settings.recoveryKeyDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-primary uppercase tracking-wider">
                  {t('settings.recoveryKeyTitle')}
                </span>
                <p className="text-xs font-mono font-bold text-foreground select-all break-all py-1">
                  {generatedRecoveryKey}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs cursor-pointer gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedRecoveryKey);
                    setIsRecoveryCopied(true);
                    setTimeout(() => setIsRecoveryCopied(false), 2000);
                  }}
                >
                  {isRecoveryCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  <span>{isRecoveryCopied ? t('settings.copied') : t('settings.copyRecoveryKey')}</span>
                </Button>
                <Button className="flex-1 h-9 text-xs cursor-pointer" onClick={() => setView('overview')}>
                  {t('settings.done')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
