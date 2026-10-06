import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  GitMerge,
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useInitialSync } from '@/hooks/useInitialSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { InitialSyncStep } from '@/services/sync/initialSyncManager';

export function InitialSyncModal() {
  const { t } = useTranslation();
  const {
    isOpen,
    step,
    progressPercent,
    downloadedFilesCount,
    totalFilesCount,
    localCount,
    remoteCount,
    error,
    isVerifyingPassphrase,
    isApplying,
    summary,
    submitE2EEPassphrase,
    selectStrategy,
    cancelInitialSync,
    closeInitialSyncModal,
  } = useInitialSync();

  const [passphrase, setPassphrase] = useState('');

  if (!isOpen) return null;

  // 步驟索引計算 (1-6)
  const getStepNumber = (s: InitialSyncStep): number => {
    switch (s) {
      case 'AUTH':
        return 1;
      case 'E2EE':
        return 2;
      case 'STRATEGY':
        return 3;
      case 'DOWNLOADING':
        return 4;
      case 'APPLYING':
        return 5;
      case 'COMPLETED':
        return 6;
      default:
        return 1;
    }
  };

  const currentStep = getStepNumber(step);

  const handleUnlock = async () => {
    if (!passphrase.trim() || isVerifyingPassphrase) return;
    const success = await submitE2EEPassphrase(passphrase.trim());
    if (success) {
      setPassphrase('');
    }
  };

  const handleCancel = () => {
    if (isApplying) return; // 寫入階段禁止中途打斷以防損壞 DB
    cancelInitialSync();
    toast.show(t('initialSync.cancelToast'));
  };

  const handleComplete = () => {
    closeInitialSyncModal();
    // 重新載入或通知頁面資料刷新
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-overlay backdrop-blur-[2px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[420px] h-[450px] bg-background border border-border rounded-xl p-6 flex flex-col justify-between select-none overflow-hidden"
      >
        {/* 頂部 Header：計步器標籤與標題 */}
        <div className="shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t('initialSync.stepCounter', { current: `0${currentStep}`, total: '06' })}
            </span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Cloud className="size-4" />
              <span className="font-mono text-xs">Dropbox</span>
            </div>
          </div>

          <h3 className="text-base font-semibold tracking-tight text-foreground mt-2">
            {step === 'AUTH' && t('initialSync.authTitle')}
            {step === 'E2EE' && t('initialSync.e2eeTitle')}
            {step === 'STRATEGY' && t('initialSync.conflictTitle')}
            {step === 'DOWNLOADING' && t('initialSync.downloadingTitle')}
            {step === 'APPLYING' && t('initialSync.applyingTitle')}
            {step === 'COMPLETED' && t('initialSync.completedTitle')}
          </h3>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1 line-clamp-2">
            {step === 'AUTH' && t('initialSync.authDesc')}
            {step === 'E2EE' && t('initialSync.e2eeDesc')}
            {step === 'STRATEGY' && t('initialSync.conflictDesc', { remote: remoteCount, local: localCount })}
            {step === 'DOWNLOADING' && t('initialSync.downloadingDesc')}
            {step === 'APPLYING' && t('initialSync.applyingDesc')}
            {step === 'COMPLETED' && t('initialSync.completedDesc')}
          </p>
        </div>

        {/* 中間主體區域：高度恆定，依步驟切換視圖 */}
        <div className="flex-1 flex flex-col justify-center py-3 overflow-hidden">
          {/* 步驟 1: AUTH 換取憑證 */}
          {step === 'AUTH' && (
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 text-foreground animate-spin" strokeWidth={1.8} />
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Connecting...
              </span>
            </div>
          )}

          {/* 步驟 2: E2EE 密碼驗證 */}
          {step === 'E2EE' && (
            <div className="space-y-3">
              <div className="relative">
                <Input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleUnlock();
                    }
                  }}
                  placeholder={t('initialSync.e2eePlaceholder')}
                  className={cn(
                    'h-10 pl-9 font-mono text-sm tracking-wide',
                    error && 'border-destructive focus-visible:ring-destructive'
                  )}
                  disabled={isVerifyingPassphrase}
                />
                <Lock className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="h-4 flex items-center">
                {error === 'INVALID_PASSPHRASE' && (
                  <span className="text-[11px] text-destructive tracking-tight">
                    {t('initialSync.e2eeError')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 步驟 3: 衝突策略選擇 (三張極簡卡片) */}
          {step === 'STRATEGY' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => selectStrategy('merge')}
                className="w-full p-2.5 rounded-lg border border-border hover:bg-muted/50 hover:border-foreground/30 transition-colors text-left flex items-start gap-3 cursor-pointer group"
              >
                <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <GitMerge className="size-3.5 text-foreground" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground flex items-center justify-between">
                    <span>{t('initialSync.mergeTitle')}</span>
                    <span className="text-[9px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                      {t('initialSync.recommended')}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {t('initialSync.mergeDesc')}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectStrategy('overwrite_local')}
                className="w-full p-2.5 rounded-lg border border-border hover:bg-muted/50 hover:border-foreground/30 transition-colors text-left flex items-start gap-3 cursor-pointer group"
              >
                <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Download className="size-3.5 text-foreground" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {t('initialSync.overwriteLocalTitle')}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {t('initialSync.overwriteLocalDesc')}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectStrategy('overwrite_remote')}
                className="w-full p-2.5 rounded-lg border border-border hover:bg-muted/50 hover:border-foreground/30 transition-colors text-left flex items-start gap-3 cursor-pointer group"
              >
                <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Upload className="size-3.5 text-foreground" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {t('initialSync.overwriteRemoteTitle')}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {t('initialSync.overwriteRemoteDesc')}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* 步驟 4: DOWNLOADING 下載進度 */}
          {step === 'DOWNLOADING' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>{downloadedFilesCount} / {totalFilesCount || '...'} FILES</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
                <span className="text-[11px] font-mono text-muted-foreground">
                  DOWNLOADING & DECRYPTING...
                </span>
              </div>
            </div>
          )}

          {/* 步驟 5: APPLYING 原子寫入 */}
          {step === 'APPLYING' && (
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 text-foreground animate-spin" strokeWidth={1.8} />
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                WRITING TO DATABASE...
              </span>
            </div>
          )}

          {/* 步驟 6: COMPLETED 完成展示 */}
          {step === 'COMPLETED' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="size-10 text-emerald-500" strokeWidth={1.8} />
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-[280px] mx-auto">
                <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                  <div className="text-[11px] text-muted-foreground">
                    {t('initialSync.summaryLedgers')}
                  </div>
                  <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                    {summary?.ledgersCount ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                  <div className="text-[11px] text-muted-foreground">
                    {t('initialSync.summaryTransactions')}
                  </div>
                  <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                    {summary?.transactionsCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部 Footer 動作按鈕：單行水平並排，左取消右確認 */}
        <div className="shrink-0 flex flex-row items-center justify-between pt-4 border-t border-border mt-auto">
          {step !== 'COMPLETED' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isApplying}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              {t('initialSync.cancelBtn')}
            </Button>
          ) : (
            <div />
          )}

          {step === 'E2EE' && (
            <Button
              type="button"
              size="sm"
              onClick={handleUnlock}
              disabled={!passphrase.trim() || isVerifyingPassphrase}
              className="text-xs"
            >
              {isVerifyingPassphrase ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                t('initialSync.unlockBtn')
              )}
            </Button>
          )}

          {step === 'COMPLETED' && (
            <Button
              type="button"
              size="sm"
              onClick={handleComplete}
              className="text-xs ml-auto"
            >
              {t('initialSync.startUsingBtn')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
