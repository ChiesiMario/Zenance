import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useAppStore } from '@/store/useAppStore';
import { PwaInstallGuideDialog } from './PwaInstallGuideDialog';
import { cn } from '@/lib/utils';

export interface PwaInstallButtonProps {
  className?: string;
}

export function PwaInstallButton({ className }: PwaInstallButtonProps) {
  const { t } = useTranslation();
  const { isStandalone } = usePwaInstall();
  const hidePwaInstallPrompt = useAppStore((state) => state.hidePwaInstallPrompt);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // 若已處於獨立 PWA 模式 (Standalone) 運行，或使用者手動隱藏提示，完全不渲染
  if (isStandalone || hidePwaInstallPrompt) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsGuideOpen(true)}
        title={t('pwa.install', '安裝')}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full',
          'border border-border bg-background/80 hover:bg-muted text-foreground',
          'transition-colors cursor-pointer select-none',
          className
        )}
      >
        <Download className="size-3.5 text-muted-foreground" />
        <span>{t('pwa.install', '安裝')}</span>
      </button>

      {/* 平級 Sibling 彈窗宣告 */}
      <PwaInstallGuideDialog
        open={isGuideOpen}
        onOpenChange={setIsGuideOpen}
      />
    </>
  );
}
