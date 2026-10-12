import { useTranslation } from 'react-i18next';
import { ShieldCheck, Fingerprint, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/dialog';
import type { AppLockConfig } from '@/store/useAppLockStore';

interface AppLockSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AppLockConfig | null;
  hasBiometricHardware: boolean;
  onUpdateLockSettings: (settings: { timeoutMinutes?: number; biometricEnabled?: boolean }) => void;
  onRequestEditSecurityQuestion: () => void;
  onDisableLock: () => void;
}

export function AppLockSettingsDialog({
  open,
  onOpenChange,
  config,
  hasBiometricHardware,
  onUpdateLockSettings,
  onRequestEditSecurityQuestion,
  onDisableLock,
}: AppLockSettingsDialogProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <span>{t('security.lockSettings')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
          <div className="h-11 px-3 flex items-center justify-between">
            <span className="text-muted-foreground font-sans">{t('security.status')}</span>
            <span className="text-emerald-500 font-medium">{t('security.statusActive')}</span>
          </div>

          <div className="h-11 px-3 flex items-center justify-between">
            <span className="text-muted-foreground font-sans">{t('security.autoLock')}</span>
            <Select
              value={String(config?.timeoutMinutes ?? 1)}
              onValueChange={(val) => {
                if (val) {
                  onUpdateLockSettings({ timeoutMinutes: parseInt(val, 10) });
                }
              }}
            >
              <SelectTrigger
                size="custom"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <SelectValue className="flex-none text-right">
                  {getLockTimeoutLabel(config?.timeoutMinutes ?? 1, true)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="0">{t('security.timeoutImmediately')}</SelectItem>
                <SelectItem value="1">{t('security.timeoutIdleMinutes', { minutes: 1 })}</SelectItem>
                <SelectItem value="5">{t('security.timeoutIdleMinutes', { minutes: 5 })}</SelectItem>
                <SelectItem value="15">{t('security.timeoutIdleMinutes', { minutes: 15 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            role="button"
            tabIndex={hasBiometricHardware ? 0 : -1}
            onClick={() => {
              if (hasBiometricHardware) {
                const current = config?.biometricEnabled ?? false;
                onUpdateLockSettings({ biometricEnabled: !current });
              }
            }}
            onKeyDown={(e) => {
              if (hasBiometricHardware && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault();
                const current = config?.biometricEnabled ?? false;
                onUpdateLockSettings({ biometricEnabled: !current });
              }
            }}
            className={cn(
              "h-11 px-3 flex items-center justify-between transition-colors select-none",
              hasBiometricHardware
                ? "hover:bg-muted/30 active:bg-muted/40 cursor-pointer"
                : "opacity-60 bg-muted/10 cursor-not-allowed"
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground font-sans flex items-center gap-1.5">
                <Fingerprint className="size-3.5 text-primary" />
                <span>{t('security.biometricUnlock')}</span>
              </span>
              {!hasBiometricHardware && (
                <span className="text-[10px] text-muted-foreground font-sans">
                  {t('security.biometricNotConfigured')}
                </span>
              )}
            </div>
            <Switch
              disabled={!hasBiometricHardware}
              checked={hasBiometricHardware && (config?.biometricEnabled ?? false)}
              onCheckedChange={(checked) => {
                if (hasBiometricHardware) {
                  onUpdateLockSettings({ biometricEnabled: checked });
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="h-11 px-3 flex items-center justify-between">
            <span className="text-muted-foreground font-sans flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-primary" />
              <span>{t('security.securityQuestion')}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-sans px-2 cursor-pointer text-primary hover:text-primary/80"
              onClick={onRequestEditSecurityQuestion}
            >
              {t('security.editSecurityQuestion')}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="destructive"
            className="w-full h-9 text-xs cursor-pointer"
            onClick={onDisableLock}
          >
            {t('security.disableLock')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
