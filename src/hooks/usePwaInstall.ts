import { useState, useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PwaPlatform = 'ios' | 'android' | 'desktop';

export function usePwaInstall() {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    
    // 1. 標準 display-mode: standalone
    const isMediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    // 2. iOS Safari 專屬 standalone 屬性
    const isIosStandalone = ('standalone' in window.navigator) && Boolean((window.navigator as unknown as { standalone: boolean }).standalone);
    // 3. Android TWA 容器環境
    const isTwa = document.referrer.startsWith('android-app://');

    return isMediaStandalone || isIosStandalone || isTwa;
  });

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // 設備平台判斷
  const platform: PwaPlatform = (() => {
    if (typeof window === 'undefined') return 'desktop';
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    const isAndroid = /android/i.test(ua);
    if (isAndroid) return 'android';
    return 'desktop';
  })();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 監聽 standalone 顯示模式變更
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    try {
      mediaQuery.addEventListener('change', handleMediaChange);
    } catch {
      mediaQuery.addListener(handleMediaChange);
    }

    // 監聽原生 beforeinstallprompt 事件 (Chrome, Edge, Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // 監聽已安裝完成事件
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      try {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } catch {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 觸發原生安裝提示
  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsStandalone(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
    return false;
  };

  return {
    isStandalone,
    canPrompt: Boolean(deferredPrompt),
    promptInstall,
    platform,
  };
}
