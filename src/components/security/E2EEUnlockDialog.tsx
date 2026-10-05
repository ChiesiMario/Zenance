import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Lock, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { unlockE2EE } from '@/services/crypto/e2eeManager';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface E2EEUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function E2EEUnlockDialog({
  open,
  onOpenChange,
  onSuccess,
}: E2EEUnlockDialogProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleUnlock = async () => {
    if (!passphrase.trim() || isUnlocking) return;

    setIsUnlocking(true);
    setIsError(false);

    try {
      const success = await unlockE2EE(passphrase.trim());
      if (success) {
        setPassphrase('');
        setIsError(false);
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setIsError(true);
        toast.show(t('settings.unlockFailed', '密碼錯誤，無法解鎖'));
      }
    } catch (err: any) {
      console.error('Unlock error:', err);
      setIsError(true);
      toast.show(t('settings.unlockFailed', '密碼錯誤，無法解鎖'));
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleClose = () => {
    setPassphrase('');
    setIsError(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isUnlocking && (val ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <KeyRound className="size-4 text-primary shrink-0" />
            <span>{t('settings.unlockE2eeTitle', '解鎖端到端加密')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('settings.unlockE2eeDesc', '雲端資料庫已啟用 E2EE 加密保護。請輸入您的同步主密碼以解鎖本地金鑰。')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          <div className="relative">
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                if (isError) setIsError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && passphrase.trim()) {
                  handleUnlock();
                }
              }}
              placeholder={t('settings.unlockE2eePlaceholder', '輸入加密主密碼...')}
              className={cn(
                "h-9 text-xs pr-8 font-mono transition-colors",
                isError && "border-destructive focus-visible:ring-destructive text-destructive"
              )}
              disabled={isUnlocking}
            />
            <Lock className="size-3.5 text-muted-foreground/50 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isUnlocking}
            className="flex-1 h-8 text-xs cursor-pointer"
          >
            {t('common.cancel', '取消')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleUnlock}
            disabled={!passphrase.trim() || isUnlocking}
            className="flex-1 h-8 text-xs cursor-pointer"
          >
            {isUnlocking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <span>{t('settings.unlockE2eeBtn', '解鎖並同步')}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
