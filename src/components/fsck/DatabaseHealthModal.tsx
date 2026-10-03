import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Wrench,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntegrityReport } from '@/services/fsck';

interface DatabaseHealthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: IntegrityReport | null;
  isScanning: boolean;
  isHealing: boolean;
  onScan: () => void;
  onHeal: () => Promise<void>;
}

export function DatabaseHealthModal({
  open,
  onOpenChange,
  report,
  isScanning,
  isHealing,
  onScan,
  onHeal,
}: DatabaseHealthModalProps) {
  const { t } = useTranslation();
  const [justRepaired, setJustRepaired] = useState(false);

  const handleRepair = async () => {
    await onHeal();
    setJustRepaired(true);
    setTimeout(() => setJustRepaired(false), 3000);
  };

  const isHealthy = report && report.issues.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-w-[400px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <span>{t('fsck.title')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('fsck.desc')}
          </DialogDescription>
        </DialogHeader>

        {isScanning ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <RefreshCw className="size-7 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground font-mono">
              {t('fsck.scanning')}
            </span>
          </div>
        ) : !report ? (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
            <ShieldCheck className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground">{t('fsck.notScanned')}</p>
            <Button size="sm" className="h-8 text-xs cursor-pointer" onClick={onScan}>
              {t('fsck.startScan')}
            </Button>
          </div>
        ) : isHealthy ? (
          <div className="py-2 flex flex-col gap-3">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col items-center text-center gap-2">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <div>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 block">
                  {t('fsck.healthy')}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  {t('fsck.noIssues')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
              <span>{t('fsck.scannedRecords', { count: report.totalRecordsScanned })}</span>
              <span>{t('fsck.duration', { ms: report.durationMs })}</span>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-9 text-xs cursor-pointer"
                onClick={onScan}
              >
                {t('fsck.recheck')}
              </Button>
              <Button
                className="flex-1 h-9 text-xs cursor-pointer"
                onClick={() => onOpenChange(false)}
              >
                {t('fsck.done')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            {/* 評分與概覽 */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                <span className="font-medium text-foreground">
                  {t('fsck.issuesFound', { count: report.issues.length })}
                </span>
              </div>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                {t('fsck.score', { score: report.score })}
              </span>
            </div>

            {/* 問題清單 */}
            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {report.issues.map((iss) => (
                <div
                  key={iss.id}
                  className="p-2.5 rounded-lg border border-border bg-muted/20 text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-[10px] font-mono px-1.5 py-0.2 rounded font-medium',
                        iss.severity === 'high'
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          : iss.severity === 'medium'
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : 'bg-muted text-muted-foreground border border-border'
                      )}
                    >
                      {iss.code}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {iss.table}
                    </span>
                  </div>
                  <p className="text-foreground text-[11px] leading-snug">{iss.description}</p>
                  <p className="text-muted-foreground/80 text-[10px] leading-tight">
                    {t('fsck.fixMethod', { action: iss.suggestedAction })}
                  </p>
                </div>
              ))}
            </div>

            {/* 修復動作按鈕 */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-9 text-xs cursor-pointer"
                disabled={isHealing}
                onClick={onScan}
              >
                {t('fsck.rescan')}
              </Button>
              <Button
                className="flex-1 h-9 text-xs cursor-pointer gap-1.5 bg-primary text-primary-foreground"
                disabled={isHealing}
                onClick={handleRepair}
              >
                {isHealing ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>{t('fsck.repairing')}</span>
                  </>
                ) : justRepaired ? (
                  <>
                    <Check className="size-3.5" />
                    <span>{t('fsck.repaired')}</span>
                  </>
                ) : (
                  <>
                    <Wrench className="size-3.5" />
                    <span>{t('fsck.oneClickRepair', { count: report.issues.length })}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
