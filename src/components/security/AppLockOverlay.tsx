import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const verifySecurityAnswer = useAppLockStore((s) => s.verifySecurityAnswer);
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
  const [recoverMethod, setRecoverMethod] = useState<'e2ee' | 'question' | 'legacy'>('e2ee');
  const [e2eePassphraseInput, setE2eePassphraseInput] = useState<string>('');
  const [securityAnswerInput, setSecurityAnswerInput] = useState<string>('');
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string>('');
  const [isRecovering, setIsRecovering] = useState<boolean>(false);

  const requiredLength = config?.pinLength || 4;

  // 單次鎖定週期的自動喚起守衛：每個鎖定週期嚴格只自動觸發一次，避免取消後的焦點回歸觸發二次彈窗
  const hasAutoTriggeredRef = useRef<boolean>(false);

  // 嘗試生物辨識解鎖 (全平台 Face ID / Touch ID / Windows Hello / Android 指紋)
  const handleBiometric = useCallback(async () => {
    if (lockoutRemainingSec > 0 || isBioVerifying) return;
    hasAutoTriggeredRef.current = true; // 標記已觸發過生物辨識
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

  // 每次 App 被鎖定時，自檢硬體狀態並重設失敗計數與單發守衛
  useEffect(() => {
    if (isLocked) {
      initLock();
      hasAutoTriggeredRef.current = false; // 新的鎖定週期，重設自動喚起標記
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

  // 智慧焦點感知：僅在視窗處於前景且具備真實活動焦點時才自動喚起生物辨識；後台時保持完全靜默
  useEffect(() => {
    if (!isLocked || view !== 'biometric' || !isBiometricEligible || lockoutRemainingSec > 0) {
      return;
    }

    let timer: NodeJS.Timeout | null = null;
    let isWindowActive = typeof document !== 'undefined' && !document.hidden && document.hasFocus();

    const triggerIfFocused = (delay = 350) => {
      // 嚴格單發守衛：本週期若已自動或手動喚起過一次，絕對不再重複自動喚起
      if (hasAutoTriggeredRef.current) return;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      // 嚴格雙重守衛：視窗必須處於非隱藏且具備系統焦點狀態
      const isVisibleAndFocused =
        typeof document !== 'undefined' &&
        !document.hidden &&
        document.hasFocus() &&
        isWindowActive;

      if (!isVisibleAndFocused) return;

      timer = setTimeout(() => {
        const stillFocused =
          typeof document !== 'undefined' &&
          !document.hidden &&
          document.hasFocus() &&
          isWindowActive;

        if (stillFocused && !isBioVerifying && !hasAutoTriggeredRef.current) {
          hasAutoTriggeredRef.current = true;
          handleBiometric();
        }
      }, delay);
    };

    // 1. 初次掛載嘗試 (僅在確定視窗擁有焦點時觸發)
    if (isWindowActive) {
      triggerIfFocused(350);
    }

    // 2. 監聽視窗焦點與可見性切換
    const handleVisibility = () => {
      if (document.hidden) {
        isWindowActive = false;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } else if (document.hasFocus()) {
        isWindowActive = true;
        triggerIfFocused(250);
      }
    };

    const handleWindowFocus = () => {
      isWindowActive = true;
      triggerIfFocused(200);
    };

    const handleWindowBlur = () => {
      isWindowActive = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // 3. 使用者點擊或觸控回歸視窗時主動激活
    const handleUserInteraction = () => {
      if (!isWindowActive) {
        isWindowActive = true;
        triggerIfFocused(150);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });

    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pointerdown', handleUserInteraction);
    };
  }, [isLocked, view, isBiometricEligible, lockoutRemainingSec, isBioVerifying, handleBiometric]);

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
    if (!e2eePassphraseInput.trim() || isRecovering || lockoutRemainingSec > 0) return;
    setIsRecovering(true);
    setForgotErrorMsg('');
    try {
      const success = await unlockE2EE(e2eePassphraseInput.trim());
      if (success) {
        disableLock();
        setView('pin');
        setEnteredPin('');
        setE2eePassphraseInput('');
        setForgotErrorMsg('');
      } else {
        setForgotErrorMsg(t('security.passphraseError'));
      }
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRecoverViaSecurityQuestion = async () => {
    if (!securityAnswerInput.trim() || isRecovering || lockoutRemainingSec > 0) return;
    setIsRecovering(true);
    setForgotErrorMsg('');
    try {
      const success = await verifySecurityAnswer(securityAnswerInput.trim());
      if (success) {
        disableLock();
        setView('pin');
        setEnteredPin('');
        setSecurityAnswerInput('');
        setForgotErrorMsg('');
      } else {
        const currentFailed = useAppLockStore.getState().failedAttempts;
        const remaining = Math.max(0, 5 - currentFailed);
        if (remaining > 0) {
          setForgotErrorMsg(t('security.answerError', { remaining }));
        } else {
          setForgotErrorMsg(t('security.tooManyAttempts'));
        }
      }
    } finally {
      setIsRecovering(false);
    }
  };

  const handleResetLockLegacy = () => {
    disableLock();
    setView('pin');
    setEnteredPin('');
    setForgotErrorMsg('');
  };

  if (!isLockConfigured || !isLocked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground select-none p-4 animate-in fade-in duration-200">
      {view === 'biometric' ? (
        /* 生物辨識首選視圖 (Biometric-First View) */
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          {/* Top Brand Logo & Status */}
          <div className="mb-4 flex flex-col items-center select-none">
            <div className="mb-3 flex items-center justify-center">
              <Logo variant="monogram" size={44} className="text-foreground transition-transform duration-300" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-1.5">
              <Lock className="size-3.5 text-primary" />
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
          {/* Top Brand Logo & Status */}
          <div className="mb-5 flex flex-col items-center select-none">
            <div className="mb-3 flex items-center justify-center">
              <Logo variant="monogram" size={44} className="text-foreground transition-transform duration-300" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-1.5">
              <Lock className="size-3.5 text-primary" />
              <span>{t('security.appLocked')}</span>
            </h1>
            <p className={cn("text-xs mt-1 min-h-[1.25rem] transition-colors leading-relaxed", isError || errorMsg ? "text-rose-500 font-medium" : "text-muted-foreground")}>
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
          <div className="grid grid-cols-3 gap-3 w-full my-2 select-none">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={lockoutRemainingSec > 0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleDigit(digit)}
                className="size-16 rounded-full bg-card hover:bg-muted/60 border border-border/80 active:bg-foreground active:text-background active:border-foreground transition-transform duration-75 active:scale-[0.96] flex items-center justify-center text-2xl font-mono font-medium text-foreground cursor-pointer shadow-none select-none mx-auto disabled:opacity-30 disabled:pointer-events-none"
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
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setView('biometric');
                    setErrorMsg('');
                  }}
                  className="size-16 rounded-full bg-card hover:bg-muted/60 border border-border/80 active:bg-foreground active:text-background active:border-foreground transition-transform duration-75 active:scale-[0.96] flex items-center justify-center text-foreground cursor-pointer shadow-none select-none disabled:opacity-30 group"
                  title={t('security.biometricButtonTitle')}
                >
                  <Fingerprint className="size-6 text-primary group-active:text-background transition-colors" />
                </button>
              )}
            </div>

            {/* Center Slot: 0 */}
            <button
              type="button"
              disabled={lockoutRemainingSec > 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleDigit('0')}
              className="size-16 rounded-full bg-card hover:bg-muted/60 border border-border/80 active:bg-foreground active:text-background active:border-foreground transition-transform duration-75 active:scale-[0.96] flex items-center justify-center text-2xl font-mono font-medium text-foreground cursor-pointer shadow-none select-none mx-auto disabled:opacity-30 disabled:pointer-events-none"
            >
              0
            </button>

            {/* Right Slot: Delete button */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={enteredPin.length === 0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleDelete}
                className="size-16 rounded-full bg-card hover:bg-muted/60 border border-border/80 active:bg-foreground active:text-background active:border-foreground transition-transform duration-75 active:scale-[0.96] flex items-center justify-center text-muted-foreground hover:text-foreground active:text-background cursor-pointer shadow-none select-none disabled:opacity-20 disabled:pointer-events-none"
                title={t('keypad.backspace', '退格')}
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
                setSecurityAnswerInput('');
                if (isE2EEEnabled()) {
                  setRecoverMethod('e2ee');
                } else if (config?.securityQuestion) {
                  setRecoverMethod('question');
                } else {
                  setRecoverMethod('legacy');
                }
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
          {/* Top Brand Logo & Status */}
          <div className="mb-6 flex flex-col items-center select-none">
            <div className="mb-3 flex items-center justify-center text-primary">
              <KeyRound className="size-10 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              {t('security.forgotPinTitle')}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {recoverMethod === 'e2ee'
                ? t('security.forgotPinDescE2ee')
                : recoverMethod === 'question'
                  ? t('security.forgotPinDescQuestion')
                  : t('security.forgotPinDescLegacy')}
            </p>
          </div>

          {recoverMethod === 'e2ee' ? (
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRecoverViaE2EE();
                  }}
                  className="h-10 text-xs text-center font-mono"
                />
                <div className="min-h-[1.25rem] mt-1.5 flex items-center justify-center">
                  {forgotErrorMsg && (
                    <span className="text-[11px] text-rose-500 block leading-tight">{forgotErrorMsg}</span>
                  )}
                </div>
              </div>

              <Button
                className="w-full h-10 text-xs cursor-pointer"
                disabled={!e2eePassphraseInput.trim() || isRecovering || lockoutRemainingSec > 0}
                onClick={handleRecoverViaE2EE}
              >
                {t('security.verifyAndUnlock')}
              </Button>

              {config?.securityQuestion && (
                <Button
                  variant="ghost"
                  className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => {
                    setRecoverMethod('question');
                    setForgotErrorMsg('');
                  }}
                >
                  {t('security.useSecurityQuestion')}
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setView('pin')}
              >
                {t('security.backToPin')}
              </Button>
            </div>
          ) : recoverMethod === 'question' ? (
            <div className="w-full space-y-3">
              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-left w-full space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  {t('security.securityQuestion')}
                </span>
                <span className="text-xs font-medium text-foreground block">
                  {config?.securityQuestion?.questionId === 'custom'
                    ? config.securityQuestion.customQuestion
                    : t(`security.questions.${config?.securityQuestion?.questionId || 'q_pet'}`)}
                </span>
              </div>

              <div>
                <Input
                  type="text"
                  placeholder={t('security.securityAnswerPlaceholder')}
                  value={securityAnswerInput}
                  onChange={(e) => {
                    setSecurityAnswerInput(e.target.value);
                    setForgotErrorMsg('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRecoverViaSecurityQuestion();
                  }}
                  className="h-10 text-xs text-center font-mono"
                />
                <div className="min-h-[1.25rem] mt-1.5 flex items-center justify-center">
                  {forgotErrorMsg && (
                    <span className="text-[11px] text-rose-500 block leading-tight">{forgotErrorMsg}</span>
                  )}
                </div>
              </div>

              <Button
                className="w-full h-10 text-xs cursor-pointer"
                disabled={!securityAnswerInput.trim() || isRecovering || lockoutRemainingSec > 0}
                onClick={handleRecoverViaSecurityQuestion}
              >
                {t('security.verifySecurityAnswer')}
              </Button>

              {isE2EEEnabled() && (
                <Button
                  variant="ghost"
                  className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => {
                    setRecoverMethod('e2ee');
                    setForgotErrorMsg('');
                  }}
                >
                  {t('security.useE2EEPassphrase')}
                </Button>
              )}

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
                onClick={handleResetLockLegacy}
              >
                {t('security.legacyResetConfirm')}
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
