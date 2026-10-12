import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

interface DangerZoneSectionProps {
  onOpenClearModal: () => void;
}

export function DangerZoneSection({ onOpenClearModal }: DangerZoneSectionProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-destructive/80 px-1 mb-2">
        {t('settings.dangerZoneSection', '危險操作')}
      </div>
      <div className="border border-destructive/25 rounded-lg overflow-hidden bg-card">
        <div
          onClick={onOpenClearModal}
          className="h-12 px-4 flex items-center justify-between hover:bg-destructive/5 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-normal text-destructive">{t('settings.clearData')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-destructive/70 group-hover:text-destructive">
            <span>{t('settings.clearDataAction')}</span>
            <ChevronRight className="size-3.5 opacity-70" />
          </div>
        </div>
      </div>
    </div>
  );
}
