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

export interface SecurityQuestionConfig {
  questionId: string; // e.g. 'q_pet' | 'q_school' | 'q_city' | 'q_movie' | 'q_friend' | 'custom'
  customQuestion?: string;
  answerHash: string;
  answerSalt: string;
}

export interface SecurityQuestionInput {
  questionId: string;
  customQuestion?: string;
  answer: string;
}

export interface AppLockConfig {
  enabled: boolean;
  pinHash: string;
  pinSalt: string;
  pinLength?: number; // 4 or 6
  biometricEnabled: boolean;
  biometricCredentialId?: string;
  timeoutMinutes: number; // 0: 立即, 1: 1分鐘, 5: 5分鐘, 15: 15分鐘
  securityQuestion?: SecurityQuestionConfig;
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
  enableLock: (
    pin: string,
    enableBiometrics?: boolean,
    timeoutMinutes?: number,
    securityQuestion?: SecurityQuestionInput
  ) => Promise<boolean>;
  verifySecurityAnswer: (answer: string) => Promise<boolean>;
  updateSecurityQuestion: (input: SecurityQuestionInput) => Promise<boolean>;
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
        // 若設備無生物識別 (未設定/無硬體/使用者在系統中關閉或移除了生物特徵)
        const currentConfig = get().config;
        if (currentConfig?.biometricEnabled && !available) {
          const updated: AppLockConfig = {
            ...currentConfig,
            biometricEnabled: false,
          };
          localStorage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(updated));
          set({ config: updated });
        }
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

      // 即時確認設備是否具備系統生物特徵
      const isAvailable = await isBiometricAvailable();
      if (!isAvailable) {
        set({ hasBiometricHardware: false });
        const updated = { ...config, biometricEnabled: false, biometricCredentialId: undefined };
        localStorage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(updated));
        set({ config: updated });
        return false;
      }

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
      timeoutMinutes = 1,
      securityQuestion?: SecurityQuestionInput
    ): Promise<boolean> => {
      if (!isCryptoSupported()) return false;

      const salt = generateRandomBytes(16);
      const pinHash = await hashPin(pin, salt);

      let biometricCredentialId: string | undefined = undefined;
      const isAvailable = await isBiometricAvailable();
      set({ hasBiometricHardware: isAvailable });

      if (enableBiometrics && isAvailable) {
        const credId = await registerBiometricCredential();
        if (credId) {
          biometricCredentialId = credId;
        }
      }

      let secQConfig: SecurityQuestionConfig | undefined = undefined;
      if (securityQuestion && securityQuestion.answer.trim()) {
        const normalized = securityQuestion.answer.trim().toLowerCase();
        const qSalt = generateRandomBytes(16);
        const aHash = await hashPin(normalized, qSalt);
        secQConfig = {
          questionId: securityQuestion.questionId,
          customQuestion:
            securityQuestion.questionId === 'custom'
              ? securityQuestion.customQuestion?.trim()
              : undefined,
          answerHash: aHash,
          answerSalt: bufferToBase64(qSalt),
        };
      }

      const newConfig: AppLockConfig = {
        enabled: true,
        pinHash,
        pinSalt: bufferToBase64(salt),
        pinLength: pin.length,
        biometricEnabled: Boolean(isAvailable && biometricCredentialId),
        biometricCredentialId: isAvailable ? biometricCredentialId : undefined,
        timeoutMinutes,
        securityQuestion: secQConfig,
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

    verifySecurityAnswer: async (answer: string): Promise<boolean> => {
      const { config, lockoutRemainingSec, failedAttempts } = get();
      if (!config?.securityQuestion) return false;
      if (lockoutRemainingSec > 0) return false;

      const normalized = answer.trim().toLowerCase();
      const saltBuffer = base64ToBuffer(config.securityQuestion.answerSalt);
      const computedHash = await hashPin(normalized, saltBuffer);

      if (computedHash === config.securityQuestion.answerHash) {
        set({ failedAttempts: 0, lockoutRemainingSec: 0 });
        return true;
      }

      const nextFailed = failedAttempts + 1;
      let lockout = 0;
      if (nextFailed >= 10) {
        lockout = 300;
      } else if (nextFailed >= 5) {
        lockout = 30;
      }

      set({
        failedAttempts: nextFailed,
        lockoutRemainingSec: lockout,
      });

      return false;
    },

    updateSecurityQuestion: async (input: SecurityQuestionInput): Promise<boolean> => {
      const cfg = getStoredConfig();
      if (!cfg || !cfg.enabled) return false;
      if (!isCryptoSupported()) return false;

      const normalized = input.answer.trim().toLowerCase();
      const salt = generateRandomBytes(16);
      const answerHash = await hashPin(normalized, salt);

      const securityQuestion: SecurityQuestionConfig = {
        questionId: input.questionId,
        customQuestion:
          input.questionId === 'custom' ? input.customQuestion?.trim() : undefined,
        answerHash,
        answerSalt: bufferToBase64(salt),
      };

      const newConfig: AppLockConfig = {
        ...cfg,
        securityQuestion,
      };

      localStorage.setItem(APP_LOCK_CONFIG_KEY, JSON.stringify(newConfig));
      set({ config: newConfig });
      return true;
    },

    updateLockSettings: async (updates: {
      timeoutMinutes?: number;
      biometricEnabled?: boolean;
    }): Promise<void> => {
      const cfg = getStoredConfig();
      if (!cfg || !cfg.enabled) return;

      let biometricCredentialId = cfg.biometricCredentialId;
      const isAvailable = await isBiometricAvailable();
      set({ hasBiometricHardware: isAvailable });

      // 若使用者關閉了生物識別，或設備生物識別在系統中被移除，立即清空憑證
      if (updates.biometricEnabled === false || !isAvailable) {
        biometricCredentialId = undefined;
      } else if (updates.biometricEnabled && !biometricCredentialId && isAvailable) {
        const credId = await registerBiometricCredential();
        if (credId) {
          biometricCredentialId = credId;
        }
      }

      const nextBioEnabled = Boolean(
        isAvailable &&
          (updates.biometricEnabled !== undefined
            ? updates.biometricEnabled && Boolean(biometricCredentialId)
            : cfg.biometricEnabled && Boolean(biometricCredentialId))
      );

      const newConfig: AppLockConfig = {
        ...cfg,
        timeoutMinutes:
          updates.timeoutMinutes !== undefined ? updates.timeoutMinutes : cfg.timeoutMinutes,
        biometricEnabled: nextBioEnabled,
        biometricCredentialId: nextBioEnabled ? biometricCredentialId : undefined,
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

// 立即觸發本機生物辨識模組可用性檢測 (Face ID / Touch ID / Windows Hello / Android)
useAppLockStore.getState().initLock();

