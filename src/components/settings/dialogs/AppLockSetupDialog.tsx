import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Fingerprint, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { isE2EEEnabled } from '@/services/crypto/e2eeManager';

interface AppLockSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasCryptoSupport: boolean;
  hasBiometricHardware: boolean;
  onSaveLock: (
    pin: string,
    enableBio: boolean,
    securityQuestion?: { questionId: string; customQuestion?: string; answer: string }
  ) => Promise<boolean>;
}

export function AppLockSetupDialog({
  open,
  onOpenChange,
  hasCryptoSupport,
  hasBiometricHardware,
  onSaveLock,
}: AppLockSetupDialogProps) {
  const { t } = useTranslation();

  const [lockPinInput, setLockPinInput] = useState('');
  const [lockPinConfirm, setLockPinConfirm] = useState('');
  const [lockEnableBio, setLockEnableBio] = useState(true);
  const [lockSecurityQuestionId, setLockSecurityQuestionId] = useState('q_pet');
  const [lockCustomQuestion, setLockCustomQuestion] = useState('');
  const [lockSecurityAnswer, setLockSecurityAnswer] = useState('');

  const getSecurityQuestionLabel = (qId: string) => {
    if (!qId) return '';
    return t(`security.questions.${qId}`);
  };

  const handleSavePinLock = async () => {
    if (!hasCryptoSupport) {
      toast.show(t('security.requiresHttpsToast'));
      return;
    }
    if (lockPinInput.length < 4) {
      toast.show(t('security.pinInvalid'));
      return;
    }
    if (lockPinInput !== lockPinConfirm) {
      toast.show(t('security.pinMismatch'));
      return;
    }

    const isE2EE = isE2EEEnabled();
    if (!isE2EE) {
      if (lockSecurityQuestionId === 'custom' && !lockCustomQuestion.trim()) {
        toast.show(t('security.customQuestionRequired'));
        return;
      }
      if (!lockSecurityAnswer.trim()) {
        toast.show(t('security.answerRequired'));
        return;
      }
    }

    const secQParam = lockSecurityAnswer.trim()
      ? {
          questionId: lockSecurityQuestionId,
          customQuestion:
            lockSecurityQuestionId === 'custom' ? lockCustomQuestion.trim() : undefined,
          answer: lockSecurityAnswer.trim(),
        }
      : undefined;

    const success = await onSaveLock(
      lockPinInput,
      lockEnableBio && hasBiometricHardware,
      secQParam
    );

    if (success) {
      onOpenChange(false);
      setLockPinInput('');
      setLockPinConfirm('');
      setLockSecurityAnswer('');
      setLockCustomQuestion('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setLockPinInput('');
          setLockPinConfirm('');
          setLockSecurityAnswer('');
          setLockCustomQuestion('');
        }
      }}
    >
      <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <span>{t('security.lockSetupTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('security.lockSetupDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('security.pinLengthLabel')}
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('security.pinPlaceholder')}
              value={lockPinInput}
              onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, ''))}
              className="h-9 text-xs tracking-widest font-mono text-center"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('security.confirmPinLabel')}
            </label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('security.confirmPinPlaceholder')}
              value={lockPinConfirm}
              onChange={(e) => setLockPinConfirm(e.target.value.replace(/\D/g, ''))}
              className="h-9 text-xs tracking-widest font-mono text-center"
            />
          </div>

          <div
            role="button"
            tabIndex={hasBiometricHardware ? 0 : -1}
            onClick={() => {
              if (hasBiometricHardware) {
                setLockEnableBio((prev) => !prev);
              }
            }}
            onKeyDown={(e) => {
              if (hasBiometricHardware && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault();
                setLockEnableBio((prev) => !prev);
              }
            }}
            className={cn(
              "p-3 rounded-lg border border-border flex items-center justify-between transition-colors select-none",
              hasBiometricHardware
                ? "bg-muted/20 hover:bg-muted/30 active:bg-muted/40 cursor-pointer"
                : "opacity-60 bg-muted/10 cursor-not-allowed"
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                <Fingerprint className="size-4 text-primary" />
                <span>{t('security.biometricSupport')}</span>
              </span>
              {!hasBiometricHardware && (
                <span className="text-[10px] text-muted-foreground font-sans">
                  {t('security.biometricNotConfigured')}
                </span>
              )}
            </div>
            <Switch
              disabled={!hasBiometricHardware}
              checked={hasBiometricHardware ? lockEnableBio : false}
              onCheckedChange={(checked) => {
                if (hasBiometricHardware) {
                  setLockEnableBio(checked);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* 安全性問題設定區塊 */}
          <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-2.5">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-primary" />
                  <span>{t('security.securityQuestion')}</span>
                </span>
                {!isE2EEEnabled() && (
                  <span className="text-[10px] text-primary font-mono font-normal">
                    *{t('common.required', '必填')}
                  </span>
                )}
              </label>
              <p className="text-[11px] text-muted-foreground leading-normal font-sans">
                {t('security.securityQuestionDesc')}
              </p>
            </div>

            <div>
              <Select
                value={lockSecurityQuestionId}
                onValueChange={(val) => val && setLockSecurityQuestionId(val)}
              >
                <SelectTrigger className="w-full h-9 text-xs">
                  <SelectValue
                    className="truncate text-left flex-1"
                    placeholder={t('security.selectSecurityQuestion')}
                  >
                    {getSecurityQuestionLabel(lockSecurityQuestionId)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="q_pet">{t('security.questions.q_pet')}</SelectItem>
                  <SelectItem value="q_school">{t('security.questions.q_school')}</SelectItem>
                  <SelectItem value="q_city">{t('security.questions.q_city')}</SelectItem>
                  <SelectItem value="q_movie">{t('security.questions.q_movie')}</SelectItem>
                  <SelectItem value="q_friend">{t('security.questions.q_friend')}</SelectItem>
                  <SelectItem value="custom">{t('security.questions.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {lockSecurityQuestionId === 'custom' && (
              <div>
                <Input
                  placeholder={t('security.customQuestionPlaceholder')}
                  value={lockCustomQuestion}
                  onChange={(e) => setLockCustomQuestion(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div>
              <Input
                placeholder={t('security.securityAnswerPlaceholder')}
                value={lockSecurityAnswer}
                onChange={(e) => setLockSecurityAnswer(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <Button className="w-full h-9 text-xs mt-2 cursor-pointer" onClick={handleSavePinLock}>
            {t('security.enableLock')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
