import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ClearDataConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredClearPhrase: string;
  clearConfirmationInput: string;
  onChangeInput: (val: string) => void;
  isClearing: boolean;
  onInitiateClear: () => void;
}

export function ClearDataConfirmDialog({
  open,
  onOpenChange,
  requiredClearPhrase,
  clearConfirmationInput,
  onChangeInput,
  isClearing,
  onInitiateClear,
}: ClearDataConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px] max-w-[350px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            <span>{t('settings.clearModalTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('settings.clearModalWarning')}
          </DialogDescription>
        </DialogHeader>

        {/* 強制自動備份提示 */}
        <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-start gap-2.5">
          <ShieldAlert className="size-4 text-primary shrink-0 mt-0.5" />
          <span className="text-xs text-muted-foreground leading-relaxed">
            {t('settings.clearAutoBackupNotice')}
          </span>
        </div>

        {/* 驗證詞輸入驗證 */}
        <div className="space-y-2 pt-1">
          <label className="text-xs text-muted-foreground block">
            {t('settings.typeToConfirmClear')}{' '}
            <span className="font-mono text-destructive font-bold select-all bg-destructive/10 px-1 py-0.5 rounded">
              {requiredClearPhrase}
            </span>{' '}
            {t('settings.toConfirmClearAction')}
          </label>
          <Input
            value={clearConfirmationInput}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder={requiredClearPhrase}
            className="font-mono"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                clearConfirmationInput.trim() === requiredClearPhrase &&
                !isClearing
              ) {
                onInitiateClear();
              }
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isClearing}
            className="cursor-pointer"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onInitiateClear}
            disabled={clearConfirmationInput.trim() !== requiredClearPhrase || isClearing}
            className="cursor-pointer bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-80"
          >
            {t('settings.proceedClearWithBackup')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
