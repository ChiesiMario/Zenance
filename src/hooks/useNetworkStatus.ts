import { useState, useEffect } from 'react';

// 全域單例狀態，確保跨頁面與多個 Hook 間的網路狀態嚴格同步
let globalIsOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Set<(online: boolean) => void>();
let probeInProgress = false;
let autoProbeTimer: ReturnType<typeof setTimeout> | null = null;

function notifyListeners(online: boolean) {
  if (globalIsOnline !== online) {
    globalIsOnline = online;
    listeners.forEach((listener) => listener(online));
  }
}

/**
 * 主動發起輕量 HEAD 探針檢測真實網際網路連通性
 * 繞過 Service Worker 與瀏覽器快取，驗證能否真正抵達網路
 */
export async function checkConnectivity(): Promise<boolean> {
  // 1. 若瀏覽器底層已明確報告離線，直接短路返回 false，零額外耗電與網路
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifyListeners(false);
    return false;
  }

  // 避免重複併發探針請求
  if (probeInProgress) {
    return globalIsOnline;
  }
  probeInProgress = true;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    // 使用不被 Service Worker 預快取的專屬探針路由，附帶時間戳以防任何 HTTP 中間快取
    const probeUrl = `${window.location.origin}/_ping?_t=${Date.now()}`;
    const res = await fetch(probeUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // 無論後端返回 200 或 404，只要 HTTP 響應成功到達，即證明網路連通
    const online = res.status > 0;
    notifyListeners(online);
    return online;
  } catch {
    // 網路不可達（Failed to fetch）或超時（AbortError）=> 確切離線
    notifyListeners(false);
    return false;
  } finally {
    probeInProgress = false;
  }
}

/**
 * 監聽瀏覽器全域網路在線/離線狀態 (具備冷啟動主動探針與自動探活機制)
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(globalIsOnline);

  useEffect(() => {
    listeners.add(setIsOnline);

    // 冷啟動或掛載時立刻執行主動探針檢測
    checkConnectivity();

    const handleOnline = () => {
      // 收到 online 事件時，立即主動探測確認連通性
      checkConnectivity();
    };

    const handleOffline = () => {
      // 收到 offline 事件時，立即置為離線
      notifyListeners(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkConnectivity();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 離線狀態下安排低頻定時探針 (每 10 秒探活一次)，確保關閉飛航模式後自動無縫恢復
    const scheduleNextProbe = () => {
      if (autoProbeTimer) clearTimeout(autoProbeTimer);
      autoProbeTimer = setTimeout(async () => {
        if (!globalIsOnline) {
          await checkConnectivity();
          scheduleNextProbe();
        }
      }, 10000);
    };

    if (!globalIsOnline) {
      scheduleNextProbe();
    }

    return () => {
      listeners.delete(setIsOnline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoProbeTimer) {
        clearTimeout(autoProbeTimer);
        autoProbeTimer = null;
      }
    };
  }, []);

  return isOnline;
}

