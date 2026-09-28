import React, { useEffect, useRef } from 'react';
import { useAppLockStore } from '@/store/useAppLockStore';
import { AppLockOverlay } from './AppLockOverlay';

interface LockGuardProps {
  children: React.ReactNode;
}

export function LockGuard({ children }: LockGuardProps) {
  const isLocked = useAppLockStore((s) => s.isLocked);
  const isLockConfigured = useAppLockStore((s) => s.isLockConfigured);
  const config = useAppLockStore((s) => s.config);
  const setLocked = useAppLockStore((s) => s.setLocked);
  const initLock = useAppLockStore((s) => s.initLock);
  const decrementLockoutSec = useAppLockStore((s) => s.decrementLockoutSec);
  const lockoutRemainingSec = useAppLockStore((s) => s.lockoutRemainingSec);

  const lastActivityRef = useRef<number>(Date.now());
  const hiddenTimeRef = useRef<number | null>(null);

  // 初始化檢測生物辨識支援
  useEffect(() => {
    initLock();
  }, [initLock]);

  // 鎖定冷卻倒數計時
  useEffect(() => {
    if (lockoutRemainingSec <= 0) return;
    const timer = setInterval(() => {
      decrementLockoutSec();
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemainingSec, decrementLockoutSec]);

  // 監聽閒置逾時與切換至後台
  useEffect(() => {
    if (!isLockConfigured || !config?.enabled) return;

    const timeoutMs = (config.timeoutMinutes || 0) * 60 * 1000;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenTimeRef.current = Date.now();
      } else {
        if (hiddenTimeRef.current !== null) {
          const elapsed = Date.now() - hiddenTimeRef.current;
          if (config.timeoutMinutes === 0 || elapsed >= timeoutMs) {
            setLocked(true);
          }
          hiddenTimeRef.current = null;
        }
      }
    };

    const idleCheckInterval = setInterval(() => {
      if (config.timeoutMinutes > 0 && !isLocked) {
        const idleElapsed = Date.now() - lastActivityRef.current;
        if (idleElapsed >= timeoutMs) {
          setLocked(true);
        }
      }
    }, 10000);

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(idleCheckInterval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLockConfigured, config, isLocked, setLocked]);

  // 核心渲染守衛：鎖定時「完全不渲染」任何子組件、不加載交易流水、不生成 DOM
  if (isLockConfigured && isLocked) {
    return <AppLockOverlay />;
  }

  return <>{children}</>;
}
