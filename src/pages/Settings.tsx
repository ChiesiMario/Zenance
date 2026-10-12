import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

import { useAppStore } from '@/store/useAppStore';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { useAppLockStore } from '@/store/useAppLockStore';
import { useStorageStatus } from '@/hooks/useStorageStatus';
import { useDatabaseHealth } from '@/hooks/useDatabaseHealth';
import { useRollingBackups } from '@/hooks/useRollingBackups';

import { DatabaseHealthModal } from '@/components/fsck/DatabaseHealthModal';
import { isE2EEEnabled, isE2EEUnlocked, setupE2EE, disableE2EE, initE2EEKey } from '@/services/crypto/e2eeManager';
import { triggerSyncUnlockNeeded } from '@/services/sync/syncEngine';
import { isCryptoSupported } from '@/services/crypto/webCrypto';
import { isSecureEnvironment } from '@/services/storage/storageManager';

import { PreferencesSection } from '@/components/settings/sections/PreferencesSection';
import { SyncSecuritySection } from '@/components/settings/sections/SyncSecuritySection';
import { DataVaultSection } from '@/components/settings/sections/DataVaultSection';
import { DangerZoneSection } from '@/components/settings/sections/DangerZoneSection';

import { DropboxSyncDialog } from '@/components/settings/dialogs/DropboxSyncDialog';
import { AppLockSetupDialog } from '@/components/settings/dialogs/AppLockSetupDialog';
import { AppLockSettingsDialog } from '@/components/settings/dialogs/AppLockSettingsDialog';
import { EditSecurityQuestionDialog } from '@/components/settings/dialogs/EditSecurityQuestionDialog';
import { TimeMachineDialog } from '@/components/settings/dialogs/TimeMachineDialog';
import { RestoreBackupDialog } from '@/components/settings/dialogs/RestoreBackupDialog';
import { ClearDataConfirmDialog } from '@/components/settings/dialogs/ClearDataConfirmDialog';
import { useBackupRestore } from '@/components/settings/hooks/useBackupRestore';

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const confirm = useConfirm();

  const { categories, archivedCategories } = useCategories();
  const { tags, archivedTags } = useTags();
  const { hidePwaInstallPrompt, setHidePwaInstallPrompt } = useAppStore();

  // 雲端同步狀態
  const {
    isAuthenticated,
    isSyncing,
    lastSyncTime,
    isOnline,
    connectDropbox,
    disconnectDropbox,
    syncNow,
  } = useDropboxSync();

  // 安全鎖狀態
  const {
    isLockConfigured,
    config: appLockConfig,
    hasBiometricHardware,
    initLock,
    enableLock,
    updateLockSettings,
    updateSecurityQuestion,
    disableLock,
  } = useAppLockStore();

  // 瀏覽器儲存狀態
  const { isPersisted, estimate, requestPersistence } = useStorageStatus();

  // 資料庫健康自檢 (FSCK)
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const {
    report: healthReport,
    isScanning: isHealthScanning,
    isHealing: isHealthHealing,
    runScan: runHealthScan,
    runHeal: runHealthHeal,
  } = useDatabaseHealth();

  // OPFS 本機時光機
  const {
    isSupported: isOpfsSupported,
    isBackingUp: isOpfsBackingUp,
    snapshots: opfsSnapshots,
    triggerBackup: triggerOpfsBackup,
    exportBackupFile: exportOpfsBackupFile,
    loadBackupForRestore: loadOpfsBackupForRestore,
  } = useRollingBackups();

  // 備份還原與清空邏輯 Hook
  const {
    fileInputRef,
    isRestoreModalOpen,
    setIsRestoreModalOpen,
    pendingBackup,
    isRestoring,
    isClearModalOpen,
    setIsClearModalOpen,
    clearConfirmationInput,
    setClearConfirmationInput,
    isClearing,
    requiredClearPhrase,
    handleExport,
    handleFileChange,
    executeRestore,
    handleRestoreFromOpfs,
    handleInitiateClear,
  } = useBackupRestore({ loadOpfsBackupForRestore });

  // 彈窗狀態管理
  const [isDropboxModalOpen, setIsDropboxModalOpen] = useState(false);
  const [isTimeMachineModalOpen, setIsTimeMachineModalOpen] = useState(false);
  const [isLockSetupModalOpen, setIsLockSetupModalOpen] = useState(false);
  const [isLockSettingsModalOpen, setIsLockSettingsModalOpen] = useState(false);
  const [isEditSecQuestionOpen, setIsEditSecQuestionOpen] = useState(false);

  // E2EE 端到端加密即時狀態
  const [e2eeActive, setE2eeActive] = useState<boolean>(isE2EEEnabled());
  const [e2eeUnlocked, setE2eeUnlocked] = useState<boolean>(isE2EEUnlocked());

  const hasCryptoSupport = isCryptoSupported();
  const isSecureEnv = isSecureEnvironment();

  // 掛載時靜默初始化 E2EE 金鑰與安全鎖
  useEffect(() => {
    let mounted = true;
    initLock();
    initE2EEKey().then(() => {
      if (mounted) {
        setE2eeActive(isE2EEEnabled());
        setE2eeUnlocked(isE2EEUnlocked());
      }
    });
    return () => {
      mounted = false;
    };
  }, [initLock]);

  // 隨時同步多設備遠端 E2EE 狀態
  useEffect(() => {
    const currentEnabled = isE2EEEnabled();
    const currentUnlocked = isE2EEUnlocked();
    if (currentEnabled !== e2eeActive) {
      setE2eeActive(currentEnabled);
    }
    if (currentUnlocked !== e2eeUnlocked) {
      setE2eeUnlocked(currentUnlocked);
    }
  }, [lastSyncTime, e2eeActive, e2eeUnlocked]);

  // E2EE 啟用回調
  const handleEnableE2EE = async (passphrase: string): Promise<string> => {
    const { recoveryKey } = await setupE2EE(passphrase);
    setE2eeActive(true);
    setE2eeUnlocked(true);

    if (isAuthenticated && isOnline) {
      syncNow('overwrite_remote');
    }
    return recoveryKey;
  };

  // E2EE 停用回調
  const handleDisableE2EE = async () => {
    if (e2eeActive && !e2eeUnlocked) {
      const restored = await initE2EEKey();
      if (!restored) {
        triggerSyncUnlockNeeded('overwrite_remote');
        return;
      }
      setE2eeUnlocked(true);
    }

    const isConfirmed = await confirm({
      title: t('settings.disableE2eeConfirmTitle', '確定要停用端到端加密嗎？'),
      description: t(
        'settings.disableE2eeConfirmDesc',
        '停用後，未來雲端同步將不再使用金鑰加密，且現有雲端資料將覆蓋為標準明文格式。'
      ),
      confirmText: t('settings.disableE2eeConfirmBtn', '確認停用'),
      cancelText: t('common.cancel', '取消'),
      variant: 'destructive',
    });
    if (!isConfirmed) return;

    disableE2EE();
    setE2eeActive(false);
    setE2eeUnlocked(true);
    toast.show(t('settings.e2eeDisabledSuccess'));

    if (isAuthenticated && isOnline) {
      await syncNow('overwrite_remote');
    }
  };

  // E2EE 解鎖回調
  const handleUnlockE2EE = async () => {
    const restored = await initE2EEKey();
    if (!restored) {
      triggerSyncUnlockNeeded('auto');
    } else {
      setE2eeUnlocked(true);
    }
  };

  // 持久化儲存請求回調
  const handleRequestPersistence = async () => {
    if (!isSecureEnv) {
      toast.show(t('settings.storageRequiresHttpsToast'));
      return;
    }
    const granted = await requestPersistence();
    toast.show(granted ? t('settings.persistenceGranted') : t('settings.persistenceDenied'));
  };

  // OPFS 快照匯出
  const handleExportOpfs = async (filename: string) => {
    const success = await exportOpfsBackupFile(filename);
    if (!success) {
      toast.show(t('settings.exportFileFailed'));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6 pb-20">
      {/* 隱藏式檔案上傳 Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 標題列 */}
      <div className="flex items-center gap-1.5 px-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-medium tracking-tight text-foreground">{t('settings.settings')}</h2>
      </div>

      {/* 區塊 1：偏好設定 */}
      <PreferencesSection
        categories={categories}
        archivedCategories={archivedCategories}
        tags={tags}
        archivedTags={archivedTags}
        hidePwaInstallPrompt={hidePwaInstallPrompt}
        onSetHidePwaInstallPrompt={setHidePwaInstallPrompt}
      />

      {/* 區塊 2：雲端與安全 */}
      <SyncSecuritySection
        isAuthenticated={isAuthenticated}
        isSyncing={isSyncing}
        isOnline={isOnline}
        e2eeActive={e2eeActive}
        e2eeUnlocked={e2eeUnlocked}
        hasCryptoSupport={hasCryptoSupport}
        isLockConfigured={isLockConfigured}
        appLockConfig={appLockConfig}
        onOpenDropboxModal={() => setIsDropboxModalOpen(true)}
        onOpenAppLock={() => {
          if (!hasCryptoSupport) {
            toast.show(t('security.requiresHttpsToast'));
            return;
          }
          initLock();
          if (!isLockConfigured) {
            setIsLockSetupModalOpen(true);
          } else {
            setIsLockSettingsModalOpen(true);
          }
        }}
      />

      {/* 區塊 3：資料與儲存 */}
      <DataVaultSection
        healthReport={healthReport}
        isSecureEnv={isSecureEnv}
        isPersisted={isPersisted}
        estimate={estimate}
        isOpfsSupported={Boolean(isOpfsSupported)}
        opfsSnapshots={opfsSnapshots}
        onOpenHealthModal={() => {
          setIsHealthModalOpen(true);
          if (!healthReport) runHealthScan();
        }}
        onRequestPersistence={handleRequestPersistence}
        onOpenTimeMachineModal={() => {
          if (!isSecureEnv || !isOpfsSupported) {
            toast.show(t('settings.storageRequiresHttpsToast'));
            return;
          }
          setIsTimeMachineModalOpen(true);
        }}
        onExportData={handleExport}
        onRequestImportFile={() => fileInputRef.current?.click()}
      />

      {/* 區塊 4：危險操作 */}
      <DangerZoneSection
        onOpenClearModal={() => {
          setClearConfirmationInput('');
          setIsClearModalOpen(true);
        }}
      />

      {/* 版本號頁尾 */}
      <div className="pt-4 text-center font-mono text-xs text-muted-foreground/50">
        Zenance v1.0.0
      </div>

      {/* 次級彈窗層次堆疊 (平級 Sibling Portals 宣告) */}
      <DropboxSyncDialog
        open={isDropboxModalOpen}
        onOpenChange={setIsDropboxModalOpen}
        isAuthenticated={isAuthenticated}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        isOnline={isOnline}
        hasCryptoSupport={hasCryptoSupport}
        e2eeActive={e2eeActive}
        e2eeUnlocked={e2eeUnlocked}
        onConnectDropbox={connectDropbox}
        onDisconnectDropbox={disconnectDropbox}
        onSyncNow={syncNow}
        onEnableE2EE={handleEnableE2EE}
        onDisableE2EE={handleDisableE2EE}
        onUnlockE2EE={handleUnlockE2EE}
      />

      <TimeMachineDialog
        open={isTimeMachineModalOpen}
        onOpenChange={setIsTimeMachineModalOpen}
        snapshots={opfsSnapshots}
        isBackingUp={isOpfsBackingUp}
        isOpfsSupported={isOpfsSupported}
        onTriggerBackup={triggerOpfsBackup}
        onExportSnapshot={handleExportOpfs}
        onRestoreSnapshot={handleRestoreFromOpfs}
      />

      <DatabaseHealthModal
        open={isHealthModalOpen}
        onOpenChange={setIsHealthModalOpen}
        report={healthReport}
        isScanning={isHealthScanning}
        isHealing={isHealthHealing}
        onScan={() => runHealthScan()}
        onHeal={async () => {
          await runHealthHeal();
        }}
      />

      <AppLockSetupDialog
        open={isLockSetupModalOpen}
        onOpenChange={setIsLockSetupModalOpen}
        hasCryptoSupport={hasCryptoSupport}
        hasBiometricHardware={hasBiometricHardware}
        onSaveLock={async (pin, enableBio, secQ) => {
          return await enableLock(pin, enableBio, 1, secQ);
        }}
      />

      <AppLockSettingsDialog
        open={isLockSettingsModalOpen}
        onOpenChange={setIsLockSettingsModalOpen}
        config={appLockConfig}
        hasBiometricHardware={hasBiometricHardware}
        onUpdateLockSettings={updateLockSettings}
        onRequestEditSecurityQuestion={() => setIsEditSecQuestionOpen(true)}
        onDisableLock={() => {
          disableLock();
          setIsLockSettingsModalOpen(false);
          toast.show(t('security.disableLockSuccess'));
        }}
      />

      <EditSecurityQuestionDialog
        open={isEditSecQuestionOpen}
        onOpenChange={setIsEditSecQuestionOpen}
        initialQuestionId={appLockConfig?.securityQuestion?.questionId}
        initialCustomQuestion={appLockConfig?.securityQuestion?.customQuestion}
        onSave={(qId, customQ, ans) => {
          updateSecurityQuestion({
            questionId: qId,
            customQuestion: customQ,
            answer: ans,
          });
        }}
      />

      <RestoreBackupDialog
        open={isRestoreModalOpen}
        onOpenChange={setIsRestoreModalOpen}
        pendingBackup={pendingBackup}
        isRestoring={isRestoring}
        onExecuteRestore={executeRestore}
      />

      <ClearDataConfirmDialog
        open={isClearModalOpen}
        onOpenChange={setIsClearModalOpen}
        requiredClearPhrase={requiredClearPhrase}
        clearConfirmationInput={clearConfirmationInput}
        onChangeInput={setClearConfirmationInput}
        isClearing={isClearing}
        onInitiateClear={handleInitiateClear}
      />
    </div>
  );
}
