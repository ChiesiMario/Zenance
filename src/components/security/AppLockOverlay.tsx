import { useState, useEffect, useCallback } from 'react';
import { Logo } from '@/components/ui/Logo';
import { Delete, Fingerprint, Lock, KeyRound, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLockStore } from '@/store/useAppLockStore';
import { isE2EEEnabled, unlockE2EE } from '@/services/crypto/e2eeManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AppLockOverlay() {
  const isLockConfigured = useAppLockStore((s) => s.isLockConfigured);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const config = useAppLockStore((s) => s.config);
  const hasBiometricHardware = useAppLockStore((s) => s.hasBiometricHardware);
  const lockoutRemainingSec = useAppLockStore((s) => s.lockoutRemainingSec);
  const unlockWithPin = useAppLockStore((s) => s.unlockWithPin);
  const unlockWithBiometric = useAppLockStore((s) => s.unlockWithBiometric);
  const disableLock = useAppLockStore((s) => s.disableLock);

  const [view, setView] = useState<'pin' | 'recover'>('pin');
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 忘記密碼救急狀態
  const [e2eePassphraseInput, setE2eePassphraseInput] = useState<string>('');
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string>('');

  const requiredLength = config?.pinLength || 4;

  // 嘗試生物辨識解鎖
  const handleBiometric = useCallback(async () => {
    if (lockoutRemainingSec > 0) return;
    const success = await unlockWithBiometric();
    if (!success) {
      setErrorMsg('生物辨識未通過，請輸入 PIN 碼');
    }
  }, [unlockWithBiometric, lockoutRemainingSec]);

  // 掛載且鎖定時，若啟用了生物辨識，自動喚起 FaceID / 指紋
  useEffect(() => {
    if (isLocked && view === 'pin' && config?.biometricEnabled && lockoutRemainingSec <= 0) {
      const timer = setTimeout(() => {
        handleBiometric();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLocked, view, config?.biometricEnabled, lockoutRemainingSec, handleBiometric]);

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
            setErrorMsg(`PIN 碼錯誤，請重新輸入 (剩餘 ${remaining} 次機會)`);
          } else {
            setErrorMsg('多次輸入錯誤，已暫時鎖定');
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
    [enteredPin, requiredLength, lockoutRemainingSec, isShaking, unlockWithPin]
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
      setForgotErrorMsg('同步主密碼錯誤，請重新輸入');
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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-2xl text-foreground select-none p-4 animate-in fade-in duration-300">
      {view === 'pin' ? (
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          {/* Top Logo & Status */}
          <div className="mb-6 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-3">
              <Logo size={32} showBorder={false} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <Lock className="size-4 text-primary" />
              <span>應用程式已鎖定</span>
            </h1>
            <p className={cn("text-xs mt-1 transition-colors", isError ? "text-rose-500 font-medium" : "text-muted-foreground")}>
              {lockoutRemainingSec > 0
                ? `多次錯誤，請等待 ${lockoutRemainingSec} 秒`
                : errorMsg || '請輸入安全 PIN 碼解鎖'}
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
              {config?.biometricEnabled && hasBiometricHardware && (
                <button
                  type="button"
                  disabled={lockoutRemainingSec > 0}
                  onClick={handleBiometric}
                  className="size-16 rounded-full bg-card hover:bg-muted/60 active:scale-95 border border-border/80 flex items-center justify-center text-foreground transition-all cursor-pointer shadow-none disabled:opacity-30"
                  title="使用指紋 / 人臉辨識解鎖"
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
              忘記 PIN 碼？
            </button>
          </div>
        </div>
      ) : (
        /* 救急/重設視圖 (原位切換，零彈窗衝突) */
        <div className="w-full max-w-[280px] flex flex-col items-center text-center animate-in fade-in duration-200">
          <div className="mb-6 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-3">
              <KeyRound className="size-7 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              忘記 PIN 碼
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {isE2EEEnabled()
                ? '請輸入您的 Dropbox 雲端同步主密碼以解鎖安全鎖。'
                : '確認重設本機安全鎖？重設後安全鎖將關閉，您的所有帳本與交易資料不會受到任何影響。'}
            </p>
          </div>

          {isE2EEEnabled() ? (
            <div className="w-full space-y-3">
              <div>
                <Input
                  type="password"
                  placeholder="輸入雲端同步主密碼..."
                  value={e2eePassphraseInput}
                  onChange={(e) => {
                    setE2eePassphraseInput(e.target.value);
                    setForgotErrorMsg('');
                  }}
                  className="h-10 text-xs text-center"
                />
                {forgotErrorMsg && (
                  <span className="text-[11px] text-rose-500 block mt-1.5">{forgotErrorMsg}</span>
                )}
              </div>

              <Button
                className="w-full h-10 text-xs cursor-pointer"
                onClick={handleRecoverViaE2EE}
              >
                驗證並解除鎖定
              </Button>

              <Button
                variant="ghost"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setView('pin')}
              >
                返回 PIN 碼解鎖
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground leading-normal flex items-start gap-2 text-left">
                <AlertTriangle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>重設後安全鎖將關閉，您可以在進入應用後於設定頁重新設定新 PIN 碼。</span>
              </div>

              <Button
                variant="destructive"
                className="w-full h-10 text-xs cursor-pointer"
                onClick={handleResetLockWithoutE2EE}
              >
                確認解除安全鎖
              </Button>

              <Button
                variant="ghost"
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setView('pin')}
              >
                返回 PIN 碼解鎖
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
