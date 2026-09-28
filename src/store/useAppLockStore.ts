import { create } from 'zustand';
import {
  hashPin,
  generateRandomBytes,
  bufferToBase64,
  base64ToBuffer,
  isCryptoSupported,
} from '@/services/crypto/webCrypto';
import {
  isBiometricAvailable,
  registerBiometricCredential,
  verifyBiometricCredential,
} from '@/services/crypto/webAuthn';

export interface AppLockConfig {
  enabled: boolean;
  pinHash: string;
  pinSalt: string;
  pinLength?: number; // 4 or 6
  biometricEnabled: boolean;
  biometricCredentialId?: string;
  timeoutMinutes: number; // 0: 立即, 1: 1分鐘, 5: 5分鐘, 15: 15分鐘
}

const APP_LOCK_CONFIG_KEY = 'zenance_app_lock_config';
const LOCK_STATE_KEY = 'zenance_app_lock_session_locked';

function getStoredConfig(): AppLockConfig | null {
  try {
    const raw = localStorage.getItem(APP_LOCK_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as AppLockConfig) : null;
  } catch {
    return null;
  }
}

interface AppLockState {
  config: AppLockConfig | null;
  isLockConfigured: boolean;
  isLocked: boolean;
  hasBiometricHardware: boolean;
  failedAttempts: number;
  lockoutRemainingSec: number;
  initLock: () => void;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  enableLock: (pin: string, enableBiometrics?: boolean, timeoutMinutes?: number) => Promise<boolean>;
  updateLockSettings: (updates: { timeoutMinutes?: number; biometricEnabled?: boolean }) => Promise<void>;
  disableLock: () => void;
  setLocked: (locked: boolean) => void;
  decrementLockoutSec: () => void;
}

export const useAppLockStore = create<AppLockState>((set, get) => {
  const initialConfig = getStoredConfig();
  const isConfigured = Boolean(initialConfig?.enabled);
  const sessionUnlocked = sessionStorage.getItem(LOCK_STATE_KEY) === 'unlocked';
  const initialLocked = isConfigured && !sessionUnlocked;

  return {
    config: initialConfig,
    isLockConfigured: isConfigured,
    isLocked: initialLocked,
    hasBiometricHardware: false,
    failedAttempts: 0,
    lockoutRemainingSec: 0,

    initLock: () => {
      isBiometricAvailable().then((available) => {
        set({ hasBiometricHardware: available });
      });
    },

    setLocked: (locked: boolean) => {
      if (locked) {
        sessionStorage.removeItem(LOCK_STATE_KEY);
      } else {
        sessionStorage.setItem(LOCK_STATE_KEY, 'unlocked');
      }
      set({ isLocked: locked });
    },

    decrementLockoutSec: () => {
      set((state) => ({
        lockoutRemainingSec: Math.max(0, state.lockoutRemainingSec - 1),
      }));
    },

    unlockWithPin: async (pin: string): Promise<boolean> => {
      const { config, lockoutRemainingSec, failedAttempts } = get();
      if (!config || !config.enabled) {
        get().setLocked(false);
        return true;
      }

      if (lockoutRemainingSec > 0) return false;

      const saltBuffer = base64ToBuffer(config.pinSalt);
      const computedHash = await hashPin(pin, saltBuffer);

      if (computedHash === config.pinHash) {
        get().setLocked(false);
        set({ failedAttempts: 0, lockoutRemainingSec: 0 });
        return true;
      }

      const nextFailed = failedAttempts + 1;
      let lockout = 0;
      if (nextFailed >= 10) {
        lockout = 300; // 10 次錯誤鎖定 5 分鐘
      } else if (nextFailed >= 5) {
        lockout = 30; // 5 次錯誤鎖定 30 秒
      }

      set({
        failedAttempts: nextFailed,
        lockoutRemainingSec: lockout,
      });

      return false;
    },

    unlockWithBiometric: async (): Promise<boolean> => {
      const { config, lockoutRemainingSec } = get();
      if (!config?.biometricEnabled) return false;
      if (lockoutRemainingSec > 0) return false;

      const success = await verifyBiometricCredential(config.biometricCredentialId);
      if (success) {
        get().setLocked(false);
        set({ failedAttempts: 0 });
        return true;
      }
      return false;
    },

    enableLock: async (
      pin: string,
      enableBiometrics = false,
      timeoutMinutes = 0
    ): Promise<boolean> => {
      if (!isCryptoSupported()) return false;

      const salt = generateRandomBytes(16);
      const pinHash = await hashPin(pin, salt);

      let biometricCredentialId: string | undefined = undefined;
      const { hasBiometricHardware } = get();
      if (enableBiometrics && hasBiometricHardware) {
        const credId = await registerBiometricCredential();
        if (credId) {
          biometricCredentialId = credId;
        }
      }

      const newConfig: AppLockConfig = {
        enabled: true,
        pinHash,
        pinSalt: bufferToBase64(salt),
        pinLength: pin.length,
        biometricEnabled: Boolean(biometricCredentialId),
        biometricCredentialId,
        timeoutMinutes,
      };

      localStorage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(newConfig));
      set({
        config: newConfig,
        isLockConfigured: true,
        isLocked: false,
      });
      sessionStorage.setItem(LOCK_STATE_KEY, 'unlocked');
      return true;
    },

    updateLockSettings: async (updates: {
      timeoutMinutes?: number;
      biometricEnabled?: boolean;
    }): Promise<void> => {
      const cfg = getStoredConfig();
      if (!cfg || !cfg.enabled) return;

      let biometricCredentialId = cfg.biometricCredentialId;
      const { hasBiometricHardware } = get();
      if (updates.biometricEnabled && !biometricCredentialId && hasBiometricHardware) {
        const credId = await registerBiometricCredential();
        if (credId) {
          biometricCredentialId = credId;
        }
      }

      const newConfig: AppLockConfig = {
        ...cfg,
        timeoutMinutes:
          updates.timeoutMinutes !== undefined ? updates.timeoutMinutes : cfg.timeoutMinutes,
        biometricEnabled:
          updates.biometricEnabled !== undefined
            ? updates.biometricEnabled && Boolean(biometricCredentialId)
            : cfg.biometricEnabled,
        biometricCredentialId,
      };

      localStorage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(newConfig));
      set({ config: newConfig });
    },

    disableLock: () => {
      localStorage.removeItem(APP_LOCK_CONFIG_KEY);
      sessionStorage.removeItem(LOCK_STATE_KEY);
      set({
        config: null,
        isLockConfigured: false,
        isLocked: false,
      });
    },
  };
});
