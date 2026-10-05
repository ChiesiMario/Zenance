import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/ui/Logo';
import { Delete, Fingerprint, Lock, KeyRound, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLockStore } from '@/store/useAppLockStore';
import { isE2EEEnabled, unlockE2EE } from '@/services/crypto/e2eeManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AppLockOverlay() {
  const { t } = useTranslation();
  const isLockConfigured = useAppLockStore((s) => s.isLockConfigured);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const config = useAppLockStore((s) => s.config);
  const hasBiometricHardware = useAppLockStore((s) => s.hasBiometricHardware);
  const lockoutRemainingSec = useAppLockStore((s) => s.lockoutRemainingSec);
  const initLock = useAppLockStore((s) => s.initLock);
  const unlockWithPin = useAppLockStore((s) => s.unlockWithPin);
  const unlockWithBiometric = useAppLockStore((s) => s.unlockWithBiometric);
  const disableLock = useAppLockStore((s) => s.disableLock);

  const isBiometricEligible = useMemo(() => {
    return Boolean(config?.biometricEnabled && hasBiometricHardware);
  }, [config?.biometricEnabled, hasBiometricHardware]);

  const [view, setView] = useState<'biometric' | 'pin' | 'recover'>(() => {
    return isBiometricEligible ? 'biometric' : 'pin';
  });

  const [bioFailCount, setBioFailCount] = useState<number>(0);
  const [isBioVerifying, setIsBioVerifying] = useState<boolean>(false);

  const [enteredPin, setEnteredPin] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 忘記密碼救急狀態
  const [e2eePassphraseInput, setE2eePassphraseInput] = useState<string>('');
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string>('');

  const requiredLength = config?.pinLength || 4;

  // 嘗試生物辨識解鎖 (全平台 Face ID / Touch ID / Windows Hello / Android 指紋)
  const handleBiometric = useCallback(async () => {
    if (lockoutRemainingSec > 0 || isBioVerifying) return;
    setIsBioVerifying(true);
    setErrorMsg('');
    try {
      const success = await unlockWithBiometric();
      if (success) {
        setBioFailCount(0);
        setErrorMsg('');
      } else {
        const nextFail = bioFailCount + 1;
        setBioFailCount(nextFail);
        if (nextFail >= 2) {
          // 累積 2 次失敗，自動回退至 PIN 碼鍵盤
          setView('pin');
          setErrorMsg(t('security.biometricFallbackToPin', '生物識別多次未通過，請輸入 PIN 碼'));
        } else {
          setErrorMsg(t('security.biometricFailed', '生物辨識未通過，請點擊重試'));
        }
      }
    } finally {
      setIsBioVerifying(false);
    }
  }, [unlockWithBiometric, lockoutRemainingSec, isBioVerifying, bioFailCount, t]);

  // 每次 App 被鎖定時，自檢硬體狀態並重設失敗計數
  useEffect(() => {
    if (isLocked) {
      initLock();
      if (isBiometricEligible) {
        setView('biometric');
        setBioFailCount(0);
      } else {
        setView('pin');
      }
      setEnteredPin('');
      setErrorMsg('');
    }
  }, [isLocked, isBiometricEligible, initLock]);

  // 掛載且鎖定時，若在生物識別首選視圖，自動喚起 Face ID / Windows Hello / 指紋
  useEffect(() => {
    if (isLocked && view === 'biometric' && isBiometricEligible && lockoutRemainingSec <= 0) {
      const timer = setTimeout(() => {
        handleBiometric();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isLocked, view, isBiometricEligible, lockoutRemainingSec, handleBiometric]);

  // 鍵入單個數字，並在滿碼時立即自動進行錯誤檢測
  const handleDigit = useCallback(
    async (digit: string) => {
      if (lockoutRemainingSec > 0 || isShaking) return;
      if (enteredPin.length >= requiredLength) return;

      const newPin = enteredPin + digit;
      setEnteredPin(newPin);
      setErrorMsg('');

      // 一旦位數滿額，自動觸發即時校驗
      if (newPin.length === requiredLength) {
        const success = await unlockWithPin(newPin);
        if (success) {
          setEnteredPin('');
          setErrorMsg('');
        } else {
          // 密碼錯誤全感官回饋：
          // 1. 觸發物理震動回饋 (若設備支援)
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([60, 50, 60]);
            } catch {}
          }

          // 2. 紅色警告高亮 + 左右劇烈抖動
          setIsError(true);
          setIsShaking(true);

          const currentFailed = useAppLockStore.getState().failedAttempts;
          const remaining = Math.max(0, 5 - currentFailed);
          if (remaining > 0) {
            setErrorMsg(t('security.pinError', { remaining }));
          } else {
            setErrorMsg(t('security.tooManyAttempts'));
          }

          // 3. 450 毫秒後自動清空圓點，無縫重新鍵入
          setTimeout(() => {
            setEnteredPin('');
            setIsShaking(false);
            setIsError(false);
          }, 450);
        }
      }
    },
    [enteredPin, requiredLength, lockoutRemainingSec, isShaking, unlockWithPin, t]
  );

  const handleDelete = useCallback(() => {
    if (isShaking) return;
    setEnteredPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
    setIsError(false);
  }, [isShaking]);

  // 實體鍵盤監聽
  useEffect(() => {
    if (!isLocked || view !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, view, handleDigit, handleDelete]);

  // 忘記密碼救急解鎖
  const handleRecoverViaE2EE = async () => {
    if (!e2eePassphraseInput.trim()) return;
    const success = await unlockE2EE(e2eePassphraseInput.trim());
    if (success) {
      disableLock();
      setView('pin');
      setEnteredPin('');
    } else {
      setForgotErrorMsg(t('security.passphraseError'));
    }
  };

  const handleResetLockWithoutE2EE = () => {
    disableLock();
    setView('pin');
    setEnteredPin('');
  };

  if (!isLockConfigured || !isLocked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground select-none p-4 animate-in fade-in duration-200">
      {view === 'biometric' ? (
        /* 生物辨識首選視圖 (Biometric-First View) */
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          {/* Top Logo & Status */}
          <div className="mb-4 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-card border border-border shadow-none flex items-center justify-center mb-3">
              <Logo size={32} showBorder={false} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <Lock className="size-4 text-primary" />
              <span>{t('security.appLocked')}</span>
            </h1>
            <p className={cn("text-xs mt-1 min-h-[1.25rem] leading-relaxed transition-colors", errorMsg ? "text-rose-500 font-medium" : "text-muted-foreground")}>
              {lockoutRemainingSec > 0
                ? t('security.lockoutWait', { seconds: lockoutRemainingSec })
                : errorMsg}
            </p>
          </div>

          {/* Central Biometric Scan Trigger Card */}
          <button
            type="button"
            disabled={isBioVerifying || lockoutRemainingSec > 0}
            onClick={handleBiometric}
            className={cn(
              "size-24 rounded-full bg-card border border-border flex flex-col items-center justify-center transition-all my-6 cursor-pointer group shadow-none outline-none active:scale-95",
              isBioVerifying && "animate-pulse border-primary ring-2 ring-primary/20",
              errorMsg && "border-destructive/60"
            )}
            title={t('security.biometricClickToRetry')}
          >
            <Fingerprint className={cn("size-10 text-primary transition-transform group-hover:scale-105", errorMsg && "text-destructive")} />
          </button>

          <p className="text-[11px] font-mono text-muted-foreground/70 mb-4">
            {isBioVerifying ? t('security.biometricVerifying') : t('security.biometricClickToRetry')}
          </p>

          {/* Fallback to PIN Button */}
          <div className="mt-2 pt-1 w-full">
            <button
              type="button"
              onClick={() => {
                setView('pin');
                setErrorMsg('');
              }}
              className="w-full py-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/80 rounded-md bg-card hover:bg-muted/40 transition-colors cursor-pointer outline-none"
            >
              {t('security.usePinInstead')}
            </button>
          </div>
        </div>
      ) : view === 'pin' ? (
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          {/* Top Logo & Status */}
          <div className="mb-6 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-card border border-border shadow-none flex items-center justify-center mb-3">
              <Logo size={32} showBorder={false} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <Lock className="size-4 text-primary" />
              <span>{t('security.appLocked')}</span>
            </h1>
            <p className={cn("text-xs mt-1 transition-colors", isError ? "text-rose-500 font-medium" : "text-muted-foreground")}>
              {lockoutRemainingSec > 0
                ? t('security.lockoutWait', { seconds: lockoutRemainingSec })
                : errorMsg || t('security.enterPinPrompt')}
            </p>
          </div>

          {/* PIN Dots Display (帶紅色錯誤反饋與劇烈擺動動畫) */}
          <div
            className={cn(
              'flex items-center justify-center gap-3.5 my-6 transition-transform',
              isShaking && 'animate-shake'
            )}
          >
            {Array.from({ length: requiredLength }).map((_, idx) => {
              const isFilled = idx < enteredPin.length;
              return (
                <div
                  key={idx}
                  className={cn(
                    'size-3.5 rounded-full border transition-all duration-150',
                    isError
                      ? 'bg-rose-500 border-rose-500 scale-110 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                      : isFilled
                      ? 'bg-foreground border-foreground scale-110'
                      : 'bg-muted/40 border-border/80'
                  )}
                />
              );
            })}
          </div>

          {/* Keypad Grid (1-9, Bio, 0, Del) */}
          <div className="grid grid-cols-3 gap-3 w-full my-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={lockoutRemainingSec > 0}
                onClick={() => handleDigit(digit)}
                className="size-16 rounded-full bg-card hover:bg-muted/60 active:scale-95 border border-border/80 flex items-center justify-center text-2xl font-mono font-medium text-foreground transition-all cursor-pointer shadow-none mx-auto disabled:opacity-30 disabled:pointer-events-none"
              >
                {digit}
              </button>
            ))}

            {/* Left Slot: Biometrics button */}
            <div className="flex items-center justify-center">
              {isBiometricEligible && (
                <button
                  type="button"
                  disabled={lockoutRemainingSec > 0}
                  onClick={() => {
                    setView('biometric');
                    setErrorMsg('');
                  }}
                  className="size-16 rounded-full bg-card hover:bg-muted/60 active:scale-95 border border-border/80 flex items-center justify-center text-foreground transition-all cursor-pointer shadow-none disabled:opacity-30"
                  title={t('security.biometricButtonTitle')}
                >
                  <Fingerprint className="size-6 text-primary" />
                </button>
              )}
            </div>

            {/* Center Slot: 0 */}
            <button
              type="button"
              disabled={lockoutRemainingSec > 0}
              onClick={() => handleDigit('0')}
              className="size-16 rounded-full bg-card hover:bg-muted/60 active:scale-95 border border-border/80 flex items-center justify-center text-2xl font-mono font-medium text-foreground transition-all cursor-pointer shadow-none mx-auto disabled:opacity-30 disabled:pointer-events-none"
            >
              0
            </button>

            {/* Right Slot: Delete button */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={enteredPin.length === 0}
                onClick={handleDelete}
                className="size-16 rounded-full bg-transparent hover:bg-muted/30 active:scale-95 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
              >
                <Delete className="size-6" />
              </button>
            </div>
          </div>

          {/* 忘記 PIN 碼救急入口 */}
          <div className="mt-5 pt-1">
            <button
              type="button"
              onClick={() => {
                setForgotErrorMsg('');
                setE2eePassphraseInput('');
                setView('recover');
              }}
              className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer outline-none"
            >
              {t('security.forgotPin')}
            </button>
          </div>
        </div>
      ) : (
        /* 救急/重設視圖 (原位切換，零彈窗衝突) */
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          <div className="mb-6 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-card border border-border shadow-none flex items-center justify-center mb-3">
              <KeyRound className="size-7 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {t('security.forgotPinTitle')}
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {isE2EEEnabled()
                ? t('security.forgotPinDescE2ee')
                : t('security.forgotPinDescNoE2ee')}
            </p>
          </div>

          {isE2EEEnabled() ? (
            <div className="w-full space-y-3">
              <div>
                <Input
                  type="password"
                  placeholder={t('security.syncPassphrasePlaceholder')}
                  value={e2eePassphraseInput}
                  onChange={(e) => {
                    setE2eePassphraseInput(e.target.value);
                    setForgotErrorMsg('');
                  }}
                  className="h-10 text-xs text-center font-mono"
                />
                {forgotErrorMsg && (
                  <span className="text-[11px] text-rose-500 block mt-1.5">{forgotErrorMsg}</span>
                )}
              </div>

              <Button
                className="w-full h-10 text-xs cursor-pointer"
                onClick={handleRecoverViaE2EE}
              >
                {t('security.verifyAndUnlock')}
              </Button>

              <Button
                variant="ghost"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setView('pin')}
              >
                {t('security.backToPin')}
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground leading-normal flex items-start gap-2 text-left">
                <AlertTriangle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>{t('security.resetWarningNoE2ee')}</span>
              </div>

              <Button
                variant="destructive"
                className="w-full h-10 text-xs cursor-pointer"
                onClick={handleResetLockWithoutE2EE}
              >
                {t('security.confirmDisableLock')}
              </Button>

              <Button
                variant="ghost"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setView('pin')}
              >
                {t('security.backToPin')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
