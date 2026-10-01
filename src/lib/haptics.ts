/**
 * PWA 原生觸覺回饋工具 (Haptic Feedback API)
 * 安全偵測環境並提供高質感觸感回饋，支援 iOS WebKit / Android PWA
 */
export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'light':
      case 'selection':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(15);
        break;
      case 'heavy':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([10, 35, 15]);
        break;
      case 'warning':
        navigator.vibrate([15, 30, 20]);
        break;
      case 'error':
        navigator.vibrate([20, 40, 20, 40, 30]);
        break;
    }
  } catch {
    // 某些受限環境或不支援設備靜默容錯
  }
}
