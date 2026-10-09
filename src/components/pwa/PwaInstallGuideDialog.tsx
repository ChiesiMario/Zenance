import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { usePwaInstall, type PwaPlatform } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';
import {
  Download,
  Share,
  PlusSquare,
  MoreVertical,
  Laptop,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export interface PwaInstallGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PwaInstallGuideDialog({
  open,
  onOpenChange,
}: PwaInstallGuideDialogProps) {
  const { t } = useTranslation();
  const { canPrompt, promptInstall, platform } = usePwaInstall();

  // 預設為目前裝置平台
  const [activeTab, setActiveTab] = useState<PwaPlatform>(platform);

  useEffect(() => {
    if (open) {
      setActiveTab(platform);
    }
  }, [open, platform]);

  const handleNativeInstall = async () => {
    const success = await promptInstall();
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-w-[92vw] p-5 gap-4 z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-5 text-primary shrink-0" />
            <span>{t('pwa.installGuideTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-0.5">
            {t('pwa.installGuideSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* 原生安裝快捷按鈕 (若瀏覽器支援 beforeinstallprompt) */}
        {canPrompt && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="size-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">
                {t('pwa.installApp')}
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleNativeInstall}
              className="h-8 text-xs px-3 shrink-0 cursor-pointer"
            >
              <Download className="size-3.5 mr-1.5" />
              <span>{t('pwa.installNow')}</span>
            </Button>
          </div>
        )}

        {/* 平台切換 Tabs (Vercel Flat 風格) */}
        <div className="grid grid-cols-3 p-1 rounded-lg border border-border bg-muted/20 gap-1 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs transition-colors cursor-pointer',
              activeTab === 'ios'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Smartphone className="size-3.5 shrink-0" />
            <span className="truncate">{t('pwa.iosTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs transition-colors cursor-pointer',
              activeTab === 'android'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Smartphone className="size-3.5 shrink-0" />
            <span className="truncate">{t('pwa.androidTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs transition-colors cursor-pointer',
              activeTab === 'desktop'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Laptop className="size-3.5 shrink-0" />
            <span className="truncate">{t('pwa.desktopTab')}</span>
          </button>
        </div>

        {/* 平台指引內容 */}
        <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
          {activeTab === 'ios' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  <span>{t('pwa.iosStep1')}</span>
                  <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded border border-border bg-muted/30 font-medium text-[11px] align-middle">
                    <Share className="size-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  <span>{t('pwa.iosStep2')}</span>
                  <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded border border-border bg-muted/30 font-medium text-[11px] align-middle">
                    <PlusSquare className="size-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  {t('pwa.iosStep3')}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'android' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  <span>{t('pwa.androidStep1')}</span>
                  <span className="inline-flex items-center gap-0.5 ml-1.5 px-1 py-0.5 rounded border border-border bg-muted/30 font-medium text-[11px] align-middle">
                    <MoreVertical className="size-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  {t('pwa.androidStep2')}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  {t('pwa.androidStep3')}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  <span>{t('pwa.desktopStep1')}</span>
                  <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded border border-border bg-muted/30 font-medium text-[11px] align-middle">
                    <Download className="size-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  {t('pwa.desktopStep2')}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="size-5 rounded-full border border-border bg-muted/40 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div className="text-xs text-foreground leading-relaxed flex-1">
                  {t('pwa.desktopStep3')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部說明與偏好提示 */}
        <div className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
          <p>{t('pwa.note')}</p>
          <p className="text-muted-foreground/80">{t('pwa.browserPreferenceHint')}</p>
        </div>

        <DialogFooter className="flex flex-row items-center justify-end sm:justify-end">
          <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer text-xs h-9 px-4" />}>
            {t('common.close', '關閉')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
