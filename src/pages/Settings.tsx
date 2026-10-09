import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  RefreshCw,
  GitMerge,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  KeyRound,
  Copy,
  Check,
  History,
  ArrowLeft,
  Plus,
  Lock,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { useTheme } from '@/components/ThemeProvider';
import { useAppStore } from '@/store/useAppStore';
import { useCategories } from '@/hooks/useCategories';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { useAppLockStore } from '@/store/useAppLockStore';
import { useStorageStatus } from '@/hooks/useStorageStatus';
import { useDatabaseHealth } from '@/hooks/useDatabaseHealth';
import { DatabaseHealthModal } from '@/components/fsck/DatabaseHealthModal';
import { isE2EEEnabled, isE2EEUnlocked, setupE2EE, disableE2EE, initE2EEKey } from '@/services/crypto/e2eeManager';
import { triggerSyncUnlockNeeded } from '@/services/sync/syncEngine';
import { isCryptoSupported } from '@/services/crypto/webCrypto';
import { isSecureEnvironment } from '@/services/storage/storageManager';
import { useRollingBackups } from '@/hooks/useRollingBackups';
import { generateBackupZipBlob } from '@/services/storage/opfsBackupService';
import {
  db,
  type Ledger,
  type Account,
  type Contact,
  type Category,
  type Budget,
  type BudgetRule,
  type Transaction,
} from '@/services/db/db';

interface LedgerBackupItem {
  ledger: Ledger;
  accounts: Account[];
  contacts?: Contact[];
  categories: Category[];
  budgets: Budget[];
  budgetRules: BudgetRule[];
  transactions: Transaction[];
}

interface ParsedBackup {
  manifest?: {
    appName?: string;
    schemaVersion?: number;
    exportedAt?: string;
    totalLedgers?: number;
  };
  ledgersData: LedgerBackupItem[];
}

export default function Settings() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const { categories, archivedCategories } = useCategories();
  const { activeLedgerId, setActiveLedgerId, hidePwaInstallPrompt, setHidePwaInstallPrompt } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // High-Risk Clear Data Confirmation Modal State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationInput, setClearConfirmationInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // Dropbox cloud sync engine
  const {
    isAuthenticated,
    isSyncing,
    lastSyncTime,
    isOnline,
    connectDropbox,
    disconnectDropbox,
    syncNow,
  } = useDropboxSync();

  // App Lock security store
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

  // Browser Storage & Persistent storage status
  const { isPersisted, estimate, requestPersistence } = useStorageStatus();

  // Database Health (FSCK)
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const {
    report: healthReport,
    isScanning: isHealthScanning,
    isHealing: isHealthHealing,
    runScan: runHealthScan,
    runHeal: runHealthHeal,
  } = useDatabaseHealth();

  // OPFS Rolling Backups (Time Machine)
  const {
    isSupported: isOpfsSupported,
    isBackingUp: isOpfsBackingUp,
    snapshots: opfsSnapshots,
    triggerBackup: triggerOpfsBackup,
    exportBackupFile: exportOpfsBackupFile,
    loadBackupForRestore: loadOpfsBackupForRestore,
  } = useRollingBackups();

  // Modals for minimalist sub-views
  const [isDropboxModalOpen, setIsDropboxModalOpen] = useState(false);
  const [dropboxModalView, setDropboxModalView] = useState<'overview' | 'enable_e2ee' | 'recovery_key'>('overview');
  const [isTimeMachineModalOpen, setIsTimeMachineModalOpen] = useState(false);

  // E2EE modal states
  const [e2eeActive, setE2eeActive] = useState<boolean>(isE2EEEnabled());
  const [e2eeUnlocked, setE2eeUnlocked] = useState<boolean>(isE2EEUnlocked());
  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [e2eeConfirmPassphrase, setE2eeConfirmPassphrase] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [isRecoveryCopied, setIsRecoveryCopied] = useState(false);

  // App Lock modal states
  const [isLockSetupModalOpen, setIsLockSetupModalOpen] = useState(false);
  const [isLockSettingsModalOpen, setIsLockSettingsModalOpen] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockPinConfirm, setLockPinConfirm] = useState('');
  const [lockEnableBio, setLockEnableBio] = useState(true);
  const [lockSecurityQuestionId, setLockSecurityQuestionId] = useState('q_pet');
  const [lockCustomQuestion, setLockCustomQuestion] = useState('');
  const [lockSecurityAnswer, setLockSecurityAnswer] = useState('');

  // 變更安全性問題次級彈窗狀態
  const [isEditSecQuestionOpen, setIsEditSecQuestionOpen] = useState(false);
  const [editSecQuestionId, setEditSecQuestionId] = useState('q_pet');
  const [editCustomQuestion, setEditCustomQuestion] = useState('');
  const [editSecAnswer, setEditSecAnswer] = useState('');

  const handleEnableE2EE = async () => {
    if (!e2eePassphrase.trim() || e2eePassphrase.length < 6) {
      toast.show(t('settings.e2eeMinLength'));
      return;
    }
    if (e2eePassphrase !== e2eeConfirmPassphrase) {
      toast.show(t('settings.e2eeMismatch'));
      return;
    }
    try {
      const { recoveryKey } = await setupE2EE(e2eePassphrase);
      setGeneratedRecoveryKey(recoveryKey);
      setE2eeActive(true);
      setE2eeUnlocked(true);
      setDropboxModalView('recovery_key');
      toast.show(t('settings.e2eeEnabledSuccess'));

      // 啟用加密後立即以端到端加密重新推送 Dropbox 雲端上的所有備份
      if (isAuthenticated && isOnline) {
        syncNow('overwrite_remote');
      }
    } catch (err: any) {
      toast.show(t('settings.e2eeEnableFailed') + (err?.message || ''));
    }
  };

  // 組件掛載時嘗試靜默從本地金庫恢復 E2EE 金鑰，消除刷新後的假鎖定狀態；並即時自檢系統生物特徵
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

  // 隨時確保本地 E2EE 狀態與 e2eeManager 保持同步 (響應多設備遠端狀態傳播)
  useEffect(() => {
    const currentEnabled = isE2EEEnabled();
    const currentUnlocked = isE2EEUnlocked();
    if (currentEnabled !== e2eeActive) {
      setE2eeActive(currentEnabled);
    }
    if (currentUnlocked !== e2eeUnlocked) {
      setE2eeUnlocked(currentUnlocked);
    }
  }, [lastSyncTime]);

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
      description: t('settings.disableE2eeConfirmDesc', '停用後，未來雲端同步將不再使用金鑰加密，且現有雲端資料將覆蓋為標準明文格式。'),
      confirmText: t('settings.disableE2eeConfirmBtn', '確認停用'),
      cancelText: t('common.cancel', '取消'),
      variant: 'destructive',
    });
    if (!isConfirmed) return;

    disableE2EE();
    setE2eeActive(false);
    setE2eeUnlocked(true);
    toast.show(t('settings.e2eeDisabledSuccess'));

    // 停用加密後立即將雲端備份覆蓋還原為標準明文格式並刷新雲端 manifest
    if (isAuthenticated && isOnline) {
      await syncNow('overwrite_remote');
    }
  };

  const handleSavePinLock = async () => {
    if (!hasCryptoSupport) {
      toast.show(t('security.requiresHttpsToast'));
      return;
    }
    if (lockPinInput.length < 4) {
      toast.show(t('security.pinInvalid'));
      return;
    }
    if (lockPinInput !== lockPinConfirm) {
      toast.show(t('security.pinMismatch'));
      return;
    }

    const isE2EE = isE2EEEnabled();
    // 未開啟 E2EE 時，強制要求設置安全性問題
    if (!isE2EE) {
      if (lockSecurityQuestionId === 'custom' && !lockCustomQuestion.trim()) {
        toast.show(t('security.customQuestionRequired'));
        return;
      }
      if (!lockSecurityAnswer.trim()) {
        toast.show(t('security.answerRequired'));
        return;
      }
    }

    const secQParam = lockSecurityAnswer.trim()
      ? {
          questionId: lockSecurityQuestionId,
          customQuestion:
            lockSecurityQuestionId === 'custom' ? lockCustomQuestion.trim() : undefined,
          answer: lockSecurityAnswer.trim(),
        }
      : undefined;

    const success = await enableLock(
      lockPinInput,
      lockEnableBio && hasBiometricHardware,
      1,
      secQParam
    );
    if (success) {
      setIsLockSetupModalOpen(false);
      setLockPinInput('');
      setLockPinConfirm('');
      setLockSecurityAnswer('');
      setLockCustomQuestion('');
      toast.show(t('security.lockEnabledSuccess'));
    } else {
      toast.show(t('security.enableLockFailed'));
    }
  };

  const handleSaveEditSecurityQuestion = async () => {
    if (editSecQuestionId === 'custom' && !editCustomQuestion.trim()) {
      toast.show(t('security.customQuestionRequired'));
      return;
    }
    if (!editSecAnswer.trim()) {
      toast.show(t('security.answerRequired'));
      return;
    }

    const success = await updateSecurityQuestion({
      questionId: editSecQuestionId,
      customQuestion:
        editSecQuestionId === 'custom' ? editCustomQuestion.trim() : undefined,
      answer: editSecAnswer.trim(),
    });

    if (success) {
      setIsEditSecQuestionOpen(false);
      setEditSecAnswer('');
      setEditCustomQuestion('');
      toast.show(t('security.securityQuestionUpdated'));
    }
  };

  const handleRequestPersistence = async () => {
    if (!isSecureEnv) {
      toast.show(t('settings.storageRequiresHttpsToast'));
      return;
    }
    const granted = await requestPersistence();
    toast.show(granted ? t('settings.persistenceGranted') : t('settings.persistenceDenied'));
  };

  const handleRestoreFromOpfs = async (filename: string) => {
    try {
      const parsed = await loadOpfsBackupForRestore(filename);
      if (!parsed) {
        toast.show(t('settings.snapshotParseFailed'));
        return;
      }
      setPendingBackup(parsed as any);
      setIsRestoreModalOpen(true);
    } catch {
      toast.show(t('settings.snapshotReadFailed'));
    }
  };

  const handleExportOpfs = async (filename: string) => {
    const success = await exportOpfsBackupFile(filename);
    if (!success) {
      toast.show(t('settings.exportFileFailed'));
    }
  };

  const hasCryptoSupport = isCryptoSupported();
  const isSecureEnv = isSecureEnvironment();
  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
  const activeCount = categories?.length ?? 0;
  const archivedCount = archivedCategories?.length ?? 0;

  const getLanguageLabel = (lang: string) => {
    if (lang === 'zh-TW' || lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return '繁體中文';
    if (lang === 'zh-CN' || lang.startsWith('zh-CN') || lang.startsWith('zh-Hans')) return '简体中文';
    return 'English';
  };

  const getThemeLabel = (tVal: string) => {
    if (tVal === 'light') return t('settings.themeLight');
    if (tVal === 'dark') return t('settings.themeDark');
    return t('settings.themeSystem');
  };

  const getLockTimeoutLabel = (minutes: number = 0, full: boolean = false) => {
    switch (minutes) {
      case 0:
        return t('security.timeoutImmediately');
      case 1:
        return full ? t('security.timeoutIdleMinutes', { minutes: 1 }) : t('security.timeoutMinutes', { minutes: 1 });
      case 5:
        return full ? t('security.timeoutIdleMinutes', { minutes: 5 }) : t('security.timeoutMinutes', { minutes: 5 });
      case 15:
        return full ? t('security.timeoutIdleMinutes', { minutes: 15 }) : t('security.timeoutMinutes', { minutes: 15 });
      default:
        return full ? t('security.timeoutIdleMinutes', { minutes }) : t('security.timeoutMinutes', { minutes });
    }
  };

  const getSecurityQuestionLabel = (qId: string) => {
    if (!qId) return '';
    return t(`security.questions.${qId}`);
  };

  const format24Time = (timestamp: number | string | Date, includeSeconds = false) => {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    if (includeSeconds) {
      return `${hh}:${mm}:${pad(d.getSeconds())}`;
    }
    return `${hh}:${mm}`;
  };

  // Required exact confirmation phrase for factory reset
  const requiredClearPhrase = (() => {
    if (currentLang === 'zh-TW' || currentLang.startsWith('zh-TW') || currentLang.startsWith('zh-Hant')) {
      return '確認刪除';
    }
    if (currentLang === 'zh-CN' || currentLang.startsWith('zh-CN') || currentLang.startsWith('zh-Hans')) {
      return '确认删除';
    }
    return 'DELETE';
  })();

  const handleExport = async () => {
    try {
      const blob = await generateBackupZipBlob();
      const dateStr = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zenance-backup-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.show(t('settings.exportSuccess'));
    } catch (error) {
      console.error('Export error:', error);
      toast.show(t('settings.exportFailed'));
    }
  };

  /**
   * Handle uploaded backup file (supports ledger-centric ZIP or legacy JSON)
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isZip = file.name.endsWith('.zip') || file.type.includes('zip');
      let parsed: ParsedBackup | null = null;

      if (isZip) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const manifestFile = zip.file('manifest.json');
        let manifest;
        if (manifestFile) {
          try {
            manifest = JSON.parse(await manifestFile.async('text'));
          } catch {
            // ignore
          }
        }

        const ledgersData: LedgerBackupItem[] = [];
        const folderNames = new Set<string>();

        zip.forEach((relativePath) => {
          if (relativePath.startsWith('ledgers/')) {
            const parts = relativePath.split('/');
            if (parts.length > 1 && parts[1]) {
              folderNames.add(parts[1]);
            }
          }
        });

        for (const ledgerId of folderNames) {
          const lFolder = zip.folder(`ledgers/${ledgerId}`);
          if (!lFolder) continue;

          const ledgerFile = lFolder.file('ledger.json');
          if (!ledgerFile) continue;

          const ledgerJson = JSON.parse(await ledgerFile.async('text'));
          const accountsFile = lFolder.file('accounts.json');
          const contactsFile = lFolder.file('contacts.json');
          const categoriesFile = lFolder.file('categories.json');
          const budgetsFile = lFolder.file('budgets.json');
          const budgetRulesFile = lFolder.file('budget_rules.json');

          const rawAccounts = accountsFile ? JSON.parse(await accountsFile.async('text')) : [];
          const rawContacts = contactsFile ? JSON.parse(await contactsFile.async('text')) : [];
          const cats = categoriesFile ? JSON.parse(await categoriesFile.async('text')) : [];
          const budgets = budgetsFile ? JSON.parse(await budgetsFile.async('text')) : [];
          const budgetRules = budgetRulesFile ? JSON.parse(await budgetRulesFile.async('text')) : [];

          // 支援按月分卷或舊版單體 transactions.json
          let txs: Transaction[] = [];
          const txFolder = lFolder.folder('transactions');
          if (txFolder) {
            const txFileNames: string[] = [];
            txFolder.forEach((relPath, file) => {
              if (relPath.endsWith('.json') && !relPath.endsWith('manifest.json') && !file.dir) {
                txFileNames.push(relPath);
              }
            });
            for (const tfName of txFileNames) {
              const tf = txFolder.file(tfName);
              if (tf) {
                try {
                  const parsed = JSON.parse(await tf.async('text'));
                  if (Array.isArray(parsed)) {
                    txs.push(...parsed);
                  }
                } catch (e) {
                  console.warn(`Failed to parse transaction chunk ${tfName}:`, e);
                }
              }
            }
          } else {
            const transactionsFile = lFolder.file('transactions.json');
            if (transactionsFile) {
              try {
                txs = JSON.parse(await transactionsFile.async('text')) || [];
              } catch (e) {
                console.warn('Failed to parse legacy transactions.json:', e);
              }
            }
          }

          // 分離可能存在的舊版混裝聯絡人
          const cleanAccounts: any[] = [];
          const cleanContacts: any[] = [...rawContacts];

          for (const acc of rawAccounts) {
            if (acc.type === 'contact') {
              if (!cleanContacts.some((c) => c.id === acc.id)) {
                cleanContacts.push({
                  id: acc.id,
                  ledgerId: acc.ledgerId || ledgerId,
                  name: acc.name,
                  group: acc.group || 'personal',
                  currency: acc.currency,
                  archived: acc.archived || false,
                  createdAt: acc.createdAt || new Date().toISOString(),
                  updatedAt: acc.updatedAt || new Date().toISOString(),
                  deleted: acc.deleted || false,
                });
              }
            } else {
              cleanAccounts.push(acc);
            }
          }

          ledgersData.push({
            ledger: ledgerJson,
            accounts: cleanAccounts,
            contacts: cleanContacts,
            categories: cats,
            budgets,
            budgetRules,
            transactions: txs,
          });
        }

        if (ledgersData.length === 0) {
          toast.show(t('settings.importInvalidFile'));
          return;
        }

        parsed = { manifest, ledgersData };
      } else {
        // Backwards compatibility for single-file JSON
        const text = await file.text();
        const raw = JSON.parse(text);
        if (!raw || !raw.data) {
          toast.show(t('settings.importInvalidFile'));
          return;
        }

        const {
          ledgers = [],
          accounts = [],
          contacts = [],
          categories: cats = [],
          budgets = [],
          budget_rules = [],
          transactions: txs = [],
        } = raw.data;

        if (!Array.isArray(ledgers) || ledgers.length === 0) {
          toast.show(t('settings.importInvalidFile'));
          return;
        }

        const ledgersData: LedgerBackupItem[] = ledgers.map((l: Ledger) => {
          const rawLAccounts = accounts.filter((a: any) => a.ledgerId === l.id);
          const lContacts = contacts.filter((c: any) => c.ledgerId === l.id);
          const cleanWallets: any[] = [];

          for (const a of rawLAccounts) {
            if (a.type === 'contact') {
              if (!lContacts.some((c: any) => c.id === a.id)) {
                lContacts.push({
                  id: a.id,
                  ledgerId: l.id,
                  name: a.name,
                  group: a.group || 'personal',
                  currency: a.currency,
                  archived: a.archived || false,
                  createdAt: a.createdAt || new Date().toISOString(),
                  updatedAt: a.updatedAt || new Date().toISOString(),
                  deleted: a.deleted || false,
                });
              }
            } else {
              cleanWallets.push(a);
            }
          }

          return {
            ledger: l,
            accounts: cleanWallets,
            contacts: lContacts,
            categories: cats.filter((c: Category) => c.ledgerId === l.id),
            budgets: budgets.filter((b: Budget) => b.ledgerId === l.id),
            budgetRules: budget_rules.filter((r: BudgetRule) => r.ledgerId === l.id),
            transactions: txs.filter((t: Transaction) => t.ledgerId === l.id),
          };
        });

        parsed = { manifest: raw, ledgersData };
      }

      setPendingBackup(parsed);
      setIsRestoreModalOpen(true);
    } catch (error) {
      console.error('Import parse error:', error);
      toast.show(t('settings.importInvalidFile'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Execute restore based on user selection: Incremental Merge or Clean Overwrite
   */
  const executeRestore = async (mode: 'merge' | 'overwrite') => {
    if (!pendingBackup) return;

    if (mode === 'overwrite') {
      const isConfirmed = await confirm({
        title: t('settings.restoreOverwriteConfirmTitle'),
        description: t('settings.restoreOverwriteConfirmDesc'),
        confirmText: t('common.confirm', '確認覆蓋'),
        cancelText: t('common.cancel', '取消'),
        variant: 'destructive',
      });
      if (!isConfirmed) return;
    }

    setIsRestoring(true);
    try {
      await db.transaction(
        'rw',
        [db.ledgers, db.transactions, db.categories, db.accounts, db.contacts, db.budgets, db.budget_rules, db.balance_snapshots],
        async () => {
          if (mode === 'overwrite') {
            await Promise.all([
              db.ledgers.clear(),
              db.transactions.clear(),
              db.categories.clear(),
              db.accounts.clear(),
              db.contacts.clear(),
              db.budgets.clear(),
              db.budget_rules.clear(),
              db.balance_snapshots.clear(),
            ]);
          }

          for (const item of pendingBackup.ledgersData) {
            if (item.ledger) await db.ledgers.put(item.ledger);
            if (item.accounts?.length) await db.accounts.bulkPut(item.accounts);
            if (item.contacts?.length) await db.contacts.bulkPut(item.contacts);
            if (item.categories?.length) await db.categories.bulkPut(item.categories);
            if (item.budgets?.length) await db.budgets.bulkPut(item.budgets);
            if (item.budgetRules?.length) await db.budget_rules.bulkPut(item.budgetRules);
            if (item.transactions?.length) await db.transactions.bulkPut(item.transactions);
          }
        }
      );

      // Validate active ledger selection
      const remainingLedgers = await db.ledgers.filter((l) => !l.deleted).toArray();
      if (remainingLedgers.length > 0) {
        const activeExists = remainingLedgers.some((l) => l.id === activeLedgerId);
        if (!activeExists) {
          const defaultLedger = remainingLedgers.find((l) => l.isDefault) || remainingLedgers[0];
          setActiveLedgerId(defaultLedger.id);
        }
      }

      toast.show(t('settings.importSuccess'));
      setIsRestoreModalOpen(false);
      setPendingBackup(null);
    } catch (error) {
      console.error('Restore error:', error);
      toast.show(t('settings.restoreFailed'));
    } finally {
      setIsRestoring(false);
    }
  };

  /**
   * Initiate Clear Process:
   * 1. Force generate and download full backup (.zip)
   * 2. Close modal and prompt final destructive confirmation dialog
   * 3. Wipe IndexedDB & localStorage if confirmed
   */
  const handleInitiateClear = async () => {
    if (clearConfirmationInput.trim() !== requiredClearPhrase || isClearing) return;
    setIsClearing(true);

    // 1. 強制自動生成並下載備份
    try {
      const blob = await generateBackupZipBlob();
      const dateStr = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zenance-backup-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.show(t('settings.autoBackupSuccess'));
    } catch (error) {
      console.error('Forced backup error:', error);
      toast.show(t('settings.backupFailedAborted'));
      setIsClearing(false);
      return; // 強制卡控：備份若失敗，絕不進行清空
    }

    // 2. 備份成功，關閉第一階段輸入彈窗並清空輸入框
    setIsClearModalOpen(false);
    setClearConfirmationInput('');

    // 3. 呼出最後確認刪除的終極高危確認視窗 (useConfirm)
    const finalConfirmed = await confirm({
      title: t('settings.finalClearConfirmTitle'),
      description: t('settings.finalClearConfirmDesc'),
      confirmText: t('settings.confirmClearFinal'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });

    if (!finalConfirmed) {
      setIsClearing(false);
      return;
    }

    // 4. 終極確認後執行物理清空
    await handleExecuteClear();
  };

  /**
   * Execute Factory Reset: Wipe all IndexedDB data and localStorage completely
   */
  const handleExecuteClear = async () => {
    try {
      await db.transaction(
        'rw',
        [db.ledgers, db.transactions, db.categories, db.accounts, db.contacts, db.budgets, db.budget_rules, db.balance_snapshots],
        async () => {
          await Promise.all([
            db.ledgers.clear(),
            db.transactions.clear(),
            db.categories.clear(),
            db.accounts.clear(),
            db.contacts.clear(),
            db.budgets.clear(),
            db.budget_rules.clear(),
            db.balance_snapshots.clear(),
          ]);
        }
      );

      // Full Factory Reset: clear localStorage completely as selected in Q2 Option B
      localStorage.clear();

      toast.show(t('settings.clearSuccess'));
      setTimeout(() => {
        window.location.href = '/setup';
      }, 700);
    } catch (error) {
      console.error('Clear error:', error);
      toast.show(t('settings.clearFailed'));
      setIsClearing(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6 pb-20">
      {/* Hidden File Input for Backup Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header Row */}
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

      {/* ========================================== */}
      {/* SECTION 1: 偏好設定                        */}
      {/* ========================================== */}
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
          {t('settings.preferencesSection', '偏好設定')}
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
          {/* 外觀主題 */}
          <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
            <span className="text-sm font-normal text-foreground">{t('settings.theme')}</span>
            <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
              <SelectTrigger
                size="custom"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <SelectValue className="flex-none text-right">
                  {getThemeLabel(theme)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
                <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 介面語言 */}
          <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
            <span className="text-sm font-normal text-foreground">{t('settings.language')}</span>
            <Select
              value={currentLang}
              onValueChange={(v) => i18n.changeLanguage(v || 'en')}
            >
              <SelectTrigger
                size="custom"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <SelectValue className="flex-none text-right">
                  {getLanguageLabel(currentLang)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="zh-TW">繁體中文</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 收支分類管理 */}
          <Link
            to="/settings/categories"
            className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors group cursor-pointer"
          >
            <span className="text-sm font-normal text-foreground">{t('settings.manageCategories')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
              <span>{t('settings.activeCount', { count: activeCount })}{archivedCount > 0 ? ` · ${t('settings.archivedCount', { count: archivedCount })}` : ''}</span>
              <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          {/* 隱藏 PWA 安裝按鈕 */}
          <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
            <span className="text-sm font-normal text-foreground">{t('settings.hidePwaInstallPrompt')}</span>
            <Switch
              checked={hidePwaInstallPrompt}
              onCheckedChange={setHidePwaInstallPrompt}
            />
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 2: 雲端與安全                      */}
      {/* ========================================== */}
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
          {t('settings.syncSecuritySection', '雲端與安全')}
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
          {/* Dropbox 同步 */}
          <div
            onClick={() => {
              setDropboxModalView('overview');
              setIsDropboxModalOpen(true);
            }}
            className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-normal text-foreground">{t('settings.dropboxSync')}</span>
            <div className="flex items-center gap-2 text-xs font-mono">
              {!isAuthenticated ? (
                <span className="text-muted-foreground">{t('settings.disconnected')}</span>
              ) : isSyncing ? (
                <span className="text-primary">{t('settings.syncing')}</span>
              ) : !isOnline ? (
                <span className="text-amber-500">{t('common.offline')}</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-500">{t('settings.connected')}</span>
                  {e2eeActive && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span
                        className={cn(
                          "text-[10px] font-sans px-1.5 py-0.5 rounded border leading-none",
                          e2eeUnlocked
                            ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                            : "border-amber-500/30 text-amber-500 bg-amber-500/5"
                        )}
                      >
                        {e2eeUnlocked ? 'E2EE' : t('settings.e2eeLocked', '已鎖定')}
                      </span>
                    </>
                  )}
                </div>
              )}
              <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </div>
          </div>

          {/* 應用程式安全鎖 */}
          <div
            onClick={() => {
              if (!hasCryptoSupport) {
                toast.show(t('security.requiresHttpsToast'));
                return;
              }
              initLock();
              if (!isLockConfigured) {
                setLockPinInput('');
                setLockPinConfirm('');
                setLockEnableBio(hasBiometricHardware);
                setIsLockSetupModalOpen(true);
              } else {
                setIsLockSettingsModalOpen(true);
              }
            }}
            className={cn(
              "h-12 px-4 flex items-center justify-between transition-colors",
              !hasCryptoSupport
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-muted/40 cursor-pointer group"
            )}
          >
            <span className="text-sm font-normal text-foreground">{t('security.lockSettings')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
              {!hasCryptoSupport ? (
                <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
              ) : isLockConfigured ? (
                <span className="text-emerald-500">
                  PIN · {getLockTimeoutLabel(appLockConfig?.timeoutMinutes ?? 1)}
                </span>
              ) : (
                <span>{t('security.statusDisabled')}</span>
              )}
              {hasCryptoSupport && (
                <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 3: 資料與儲存                      */}
      {/* ========================================== */}
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
          {t('settings.dataVaultSection', '資料與儲存')}
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
          {/* 資料庫健康自檢 (FSCK) */}
          <div
            onClick={() => {
              setIsHealthModalOpen(true);
              if (!healthReport) runHealthScan();
            }}
            className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-normal text-foreground">{t('fsck.title')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
              {healthReport ? (
                healthReport.score === 100 ? (
                  <span className="text-emerald-500">{t('fsck.scoreGood')}</span>
                ) : (
                  <span className="text-amber-500">{t('fsck.scoreNeedRepair', { score: healthReport.score })}</span>
                )
              ) : (
                <span>{t('fsck.checkNow')}</span>
              )}
              <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* 持久化存儲 */}
          <div
            onClick={() => {
              if (!isSecureEnv) {
                toast.show(t('settings.storageRequiresHttpsToast'));
                return;
              }
              if (!isPersisted) handleRequestPersistence();
            }}
            className={cn(
              "h-12 px-4 flex items-center justify-between transition-colors",
              !isSecureEnv
                ? "opacity-60 cursor-not-allowed"
                : !isPersisted && "cursor-pointer hover:bg-muted/40"
            )}
          >
            <span className="text-sm font-normal text-foreground">{t('settings.persistenceProtection')}</span>
            <div className="flex items-center gap-2 text-xs font-mono">
              {!isSecureEnv ? (
                <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
              ) : isPersisted ? (
                <span className="text-emerald-500">{t('settings.persistenceProtected')}</span>
              ) : (
                <span className="text-amber-500">{t('settings.requestPersistence')}</span>
              )}
              {isSecureEnv && estimate && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-muted-foreground">{estimate.usageFormatted}</span>
                </>
              )}
            </div>
          </div>

          {/* 本機時光機快照 */}
          <div
            onClick={() => {
              if (!isSecureEnv || !isOpfsSupported) {
                toast.show(t('settings.storageRequiresHttpsToast'));
                return;
              }
              setIsTimeMachineModalOpen(true);
            }}
            className={cn(
              "h-12 px-4 flex items-center justify-between transition-colors",
              !isSecureEnv || !isOpfsSupported
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-muted/40 cursor-pointer group"
            )}
          >
            <span className="text-sm font-normal text-foreground">{t('settings.timeMachineBackup')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
              {!isSecureEnv || !isOpfsSupported ? (
                <span className="text-amber-500/80">{t('security.requiresHttps')}</span>
              ) : (
                <span>{t('settings.snapshotsCount', { count: opfsSnapshots.length })}</span>
              )}
              {isSecureEnv && isOpfsSupported && (
                <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>

          {/* 匯出備份 */}
          <div
            onClick={handleExport}
            className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-normal text-foreground">{t('settings.exportData')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
              <span>ZIP</span>
              <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* 匯入還原 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-normal text-foreground">{t('settings.importData')}</span>
            <ChevronRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 4: 危險區域                        */}
      {/* ========================================== */}
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-destructive/80 px-1 mb-2">
          {t('settings.dangerZoneSection', '危險操作')}
        </div>
        <div className="border border-destructive/25 rounded-lg overflow-hidden bg-card">
          <div
            onClick={() => {
              setClearConfirmationInput('');
              setIsClearModalOpen(true);
            }}
            className="h-12 px-4 flex items-center justify-between hover:bg-destructive/5 transition-colors cursor-pointer group"
          >
            <span className="text-sm font-normal text-destructive">{t('settings.clearData')}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-destructive/70 group-hover:text-destructive">
              <span>{t('settings.clearDataAction')}</span>
              <ChevronRight className="size-3.5 opacity-70" />
            </div>
          </div>
        </div>
      </div>

      {/* Clean Monospace Footer */}
      <div className="pt-4 text-center font-mono text-xs text-muted-foreground/50">
        Zenance v1.0.0
      </div>

      {/* Dropbox 快速管理彈窗（雲端同步與安全中心） */}
      <Dialog
        open={isDropboxModalOpen}
        onOpenChange={(open) => {
          setIsDropboxModalOpen(open);
          if (!open) {
            setDropboxModalView('overview');
            setE2eePassphrase('');
            setE2eeConfirmPassphrase('');
            setGeneratedRecoveryKey('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
          {dropboxModalView === 'overview' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <Cloud className="size-5 text-primary" />
                  <span>{t('settings.dropboxSyncModalTitle')}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
                {/* 連線狀態 */}
                <div className="p-3 flex justify-between items-center">
                  <span className="text-muted-foreground font-sans">{t('settings.status')}</span>
                  <span className={isAuthenticated ? "text-emerald-500 font-medium" : "text-muted-foreground"}>
                    {isAuthenticated ? t('settings.connected') : t('settings.disconnected')}
                  </span>
                </div>

                {/* 上次同步 */}
                {isAuthenticated && (
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-muted-foreground font-sans">{t('settings.lastSync')}</span>
                    <span className="text-foreground">
                      {lastSyncTime
                        ? format24Time(lastSyncTime, true)
                        : t('settings.never')}
                    </span>
                  </div>
                )}

                {/* 端到端加密 E2EE */}
                <div className="p-3 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground font-sans">{t('settings.e2ee')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!hasCryptoSupport ? (
                      <span className="text-amber-500/80 font-sans">{t('security.requiresHttps')}</span>
                    ) : !isAuthenticated ? (
                      <span className="text-muted-foreground/60 font-sans">{t('settings.requiresCloudSync', '需連線雲端')}</span>
                    ) : !e2eeActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setE2eePassphrase('');
                          setE2eeConfirmPassphrase('');
                          setGeneratedRecoveryKey('');
                          setDropboxModalView('enable_e2ee');
                        }}
                        className="h-6 px-2.5 inline-flex items-center gap-1 text-[11px] font-sans rounded-full border border-border bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer group/pill"
                      >
                        <Plus className="size-3 text-muted-foreground group-hover/pill:text-foreground transition-colors" />
                        <span>{t('settings.enableAction', '啟用')}</span>
                      </button>
                    ) : !e2eeUnlocked ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const restored = await initE2EEKey();
                          if (!restored) {
                            triggerSyncUnlockNeeded('auto');
                          } else {
                            setE2eeUnlocked(true);
                          }
                        }}
                        className="h-6 px-2.5 inline-flex items-center gap-1 text-[11px] font-sans rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      >
                        <Lock className="size-3" />
                        <span>{t('settings.unlockAction', '解鎖')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDisableE2EE}
                        className="h-6 px-2.5 inline-flex items-center gap-1.5 text-[11px] font-sans rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer group/pill"
                        title={t('settings.clickToDisableE2ee', '點擊停用端到端加密')}
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500 group-hover/pill:bg-destructive transition-colors shrink-0" />
                        <span className="font-mono">AES-256</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {!isAuthenticated ? (
                  <Button
                    className="w-full h-9 text-xs cursor-pointer"
                    disabled={isSyncing}
                    onClick={() => {
                      setIsDropboxModalOpen(false);
                      connectDropbox();
                    }}
                  >
                    {t('settings.connectDropbox')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 h-9 text-xs cursor-pointer"
                      disabled={isSyncing || !isOnline}
                      onClick={async () => {
                        await syncNow();
                      }}
                    >
                      <RefreshCw className={cn("size-3.5 mr-1.5", isSyncing && "animate-spin")} />
                      <span>{isSyncing ? t('settings.syncing') : t('settings.syncNow')}</span>
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 h-9 text-xs cursor-pointer"
                      disabled={isSyncing}
                      onClick={() => {
                        setIsDropboxModalOpen(false);
                        disconnectDropbox();
                      }}
                    >
                      {t('settings.disconnect')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {dropboxModalView === 'enable_e2ee' && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDropboxModalView('overview')}
                    className="size-7 -ml-1 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Back"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                    <KeyRound className="size-5 text-primary" />
                    <span>{t('settings.enableE2eeTitle')}</span>
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                  {t('settings.enableE2eeDesc')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    {t('settings.e2eePassphraseLabel')}
                  </label>
                  <Input
                    type="password"
                    placeholder={t('settings.e2eePassphrasePlaceholder')}
                    value={e2eePassphrase}
                    onChange={(e) => setE2eePassphrase(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    {t('settings.confirmE2eePassphraseLabel')}
                  </label>
                  <Input
                    type="password"
                    placeholder={t('settings.confirmE2eePassphrasePlaceholder')}
                    value={e2eeConfirmPassphrase}
                    onChange={(e) => setE2eeConfirmPassphrase(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs cursor-pointer"
                    onClick={() => setDropboxModalView('overview')}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    className="flex-1 h-9 text-xs cursor-pointer"
                    onClick={handleEnableE2EE}
                  >
                    {t('settings.enableNow')}
                  </Button>
                </div>
              </div>
            </>
          )}

          {dropboxModalView === 'recovery_key' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <KeyRound className="size-5 text-primary" />
                  <span>{t('settings.recoveryKeyTitle')}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                  {t('settings.recoveryKeyDesc')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-primary uppercase tracking-wider">
                    {t('settings.recoveryKeyTitle')}
                  </span>
                  <p className="text-xs font-mono font-bold text-foreground select-all break-all py-1">
                    {generatedRecoveryKey}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs cursor-pointer gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedRecoveryKey);
                      setIsRecoveryCopied(true);
                      setTimeout(() => setIsRecoveryCopied(false), 2000);
                    }}
                  >
                    {isRecoveryCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span>{isRecoveryCopied ? t('settings.copied') : t('settings.copyRecoveryKey')}</span>
                  </Button>
                  <Button
                    className="flex-1 h-9 text-xs cursor-pointer"
                    onClick={() => {
                      setDropboxModalView('overview');
                    }}
                  >
                    {t('settings.done')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 本機時光機彈窗 */}
      <Dialog open={isTimeMachineModalOpen} onOpenChange={setIsTimeMachineModalOpen}>
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <History className="size-5 text-primary" />
              <span>{t('settings.timeMachineModalTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              {t('settings.timeMachineModalDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
            {opfsSnapshots.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground font-sans">
                {t('settings.noSnapshotsYet')}
              </div>
            ) : (
              opfsSnapshots.map((snap) => (
                <div key={snap.id} className="p-3 flex items-center justify-between">
                  <div>
                    <span className="font-sans font-medium text-foreground block">
                      {snap.id === 'daily'
                        ? t('settings.snapshotDaily')
                        : snap.id === 'weekly'
                          ? t('settings.snapshotWeekly')
                          : snap.id === 'monthly'
                            ? t('settings.snapshotMonthly')
                            : snap.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{snap.date} · {snap.sizeFormatted}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportOpfs(snap.filename)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                    >
                      {t('settings.exportAction')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTimeMachineModalOpen(false);
                        handleRestoreFromOpfs(snap.filename);
                      }}
                      className="text-emerald-500 hover:underline cursor-pointer text-xs font-medium"
                    >
                      {t('settings.restoreAction')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs cursor-pointer gap-1.5"
              disabled={isOpfsBackingUp || !isOpfsSupported}
              onClick={async () => {
                const ok = await triggerOpfsBackup(true);
                toast.show(ok ? t('settings.snapshotSuccess') : t('settings.snapshotFailed'));
              }}
            >
              <RefreshCw className={cn("size-3.5", isOpfsBackingUp && "animate-spin")} />
              <span>{t('settings.createSnapshotNow')}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 資料庫健康診斷與自癒彈窗 (FSCK) */}
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





      {/* 應用程式安全鎖 PIN 碼設定彈窗 */}
      <Dialog open={isLockSetupModalOpen} onOpenChange={setIsLockSetupModalOpen}>
        <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <span>{t('security.lockSetupTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              {t('security.lockSetupDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('security.pinLengthLabel')}
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder={t('security.pinPlaceholder')}
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, ''))}
                className="h-9 text-xs tracking-widest font-mono text-center"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('security.confirmPinLabel')}
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder={t('security.confirmPinPlaceholder')}
                value={lockPinConfirm}
                onChange={(e) => setLockPinConfirm(e.target.value.replace(/\D/g, ''))}
                className="h-9 text-xs tracking-widest font-mono text-center"
              />
            </div>

            <div
              role="button"
              tabIndex={hasBiometricHardware ? 0 : -1}
              onClick={() => {
                if (hasBiometricHardware) {
                  setLockEnableBio((prev) => !prev);
                }
              }}
              onKeyDown={(e) => {
                if (hasBiometricHardware && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  setLockEnableBio((prev) => !prev);
                }
              }}
              className={cn(
                "p-3 rounded-lg border border-border flex items-center justify-between transition-colors select-none",
                hasBiometricHardware
                  ? "bg-muted/20 hover:bg-muted/30 active:bg-muted/40 cursor-pointer"
                  : "opacity-60 bg-muted/10 cursor-not-allowed"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                  <Fingerprint className="size-4 text-primary" />
                  <span>{t('security.biometricSupport')}</span>
                </span>
                {!hasBiometricHardware && (
                  <span className="text-[10px] text-muted-foreground font-sans">
                    {t('security.biometricNotConfigured')}
                  </span>
                )}
              </div>
              <Switch
                disabled={!hasBiometricHardware}
                checked={hasBiometricHardware ? lockEnableBio : false}
                onCheckedChange={(checked) => {
                  if (hasBiometricHardware) {
                    setLockEnableBio(checked);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* 安全性問題設定區塊 */}
            <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-2.5">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="size-3.5 text-primary" />
                    <span>{t('security.securityQuestion')}</span>
                  </span>
                  {!isE2EEEnabled() && (
                    <span className="text-[10px] text-primary font-mono font-normal">
                      *{t('common.required', '必填')}
                    </span>
                  )}
                </label>
                <p className="text-[11px] text-muted-foreground leading-normal font-sans">
                  {t('security.securityQuestionDesc')}
                </p>
              </div>

              <div>
                <Select
                  value={lockSecurityQuestionId}
                  onValueChange={(val) => val && setLockSecurityQuestionId(val)}
                >
                  <SelectTrigger className="w-full h-9 text-xs">
                    <SelectValue
                      className="truncate text-left flex-1"
                      placeholder={t('security.selectSecurityQuestion')}
                    >
                      {getSecurityQuestionLabel(lockSecurityQuestionId)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="q_pet">{t('security.questions.q_pet')}</SelectItem>
                    <SelectItem value="q_school">{t('security.questions.q_school')}</SelectItem>
                    <SelectItem value="q_city">{t('security.questions.q_city')}</SelectItem>
                    <SelectItem value="q_movie">{t('security.questions.q_movie')}</SelectItem>
                    <SelectItem value="q_friend">{t('security.questions.q_friend')}</SelectItem>
                    <SelectItem value="custom">{t('security.questions.custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {lockSecurityQuestionId === 'custom' && (
                <div>
                  <Input
                    placeholder={t('security.customQuestionPlaceholder')}
                    value={lockCustomQuestion}
                    onChange={(e) => setLockCustomQuestion(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              <div>
                <Input
                  placeholder={t('security.securityAnswerPlaceholder')}
                  value={lockSecurityAnswer}
                  onChange={(e) => setLockSecurityAnswer(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <Button
              className="w-full h-9 text-xs mt-2 cursor-pointer"
              onClick={handleSavePinLock}
            >
              {t('security.enableLock')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 應用程式安全鎖管理彈窗 */}
      <Dialog open={isLockSettingsModalOpen} onOpenChange={setIsLockSettingsModalOpen}>
        <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <span>{t('security.lockSettings')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y divide-border border border-border rounded-md text-xs font-mono">
            <div className="h-11 px-3 flex items-center justify-between">
              <span className="text-muted-foreground font-sans">{t('security.status')}</span>
              <span className="text-emerald-500 font-medium">{t('security.statusActive')}</span>
            </div>

            <div className="h-11 px-3 flex items-center justify-between">
              <span className="text-muted-foreground font-sans">{t('security.autoLock')}</span>
              <Select
                value={String(appLockConfig?.timeoutMinutes ?? 1)}
                onValueChange={(val) => {
                  if (val) {
                    updateLockSettings({ timeoutMinutes: parseInt(val, 10) });
                  }
                }}
              >
                <SelectTrigger
                  size="custom"
                  className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                >
                  <SelectValue className="flex-none text-right">
                    {getLockTimeoutLabel(appLockConfig?.timeoutMinutes ?? 1, true)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="0">{t('security.timeoutImmediately')}</SelectItem>
                  <SelectItem value="1">{t('security.timeoutIdleMinutes', { minutes: 1 })}</SelectItem>
                  <SelectItem value="5">{t('security.timeoutIdleMinutes', { minutes: 5 })}</SelectItem>
                  <SelectItem value="15">{t('security.timeoutIdleMinutes', { minutes: 15 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              role="button"
              tabIndex={hasBiometricHardware ? 0 : -1}
              onClick={() => {
                if (hasBiometricHardware) {
                  const current = appLockConfig?.biometricEnabled ?? false;
                  updateLockSettings({ biometricEnabled: !current });
                }
              }}
              onKeyDown={(e) => {
                if (hasBiometricHardware && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  const current = appLockConfig?.biometricEnabled ?? false;
                  updateLockSettings({ biometricEnabled: !current });
                }
              }}
              className={cn(
                "h-11 px-3 flex items-center justify-between transition-colors select-none",
                hasBiometricHardware
                  ? "hover:bg-muted/30 active:bg-muted/40 cursor-pointer"
                  : "opacity-60 bg-muted/10 cursor-not-allowed"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground font-sans flex items-center gap-1.5">
                  <Fingerprint className="size-3.5 text-primary" />
                  <span>{t('security.biometricUnlock')}</span>
                </span>
                {!hasBiometricHardware && (
                  <span className="text-[10px] text-muted-foreground font-sans">
                    {t('security.biometricNotConfigured')}
                  </span>
                )}
              </div>
              <Switch
                disabled={!hasBiometricHardware}
                checked={hasBiometricHardware && (appLockConfig?.biometricEnabled ?? false)}
                onCheckedChange={(checked) => {
                  if (hasBiometricHardware) {
                    updateLockSettings({ biometricEnabled: checked });
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="h-11 px-3 flex items-center justify-between">
              <span className="text-muted-foreground font-sans flex items-center gap-1.5">
                <HelpCircle className="size-3.5 text-primary" />
                <span>{t('security.securityQuestion')}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs font-sans px-2 cursor-pointer text-primary hover:text-primary/80"
                onClick={() => {
                  setEditSecQuestionId(appLockConfig?.securityQuestion?.questionId || 'q_pet');
                  setEditCustomQuestion(appLockConfig?.securityQuestion?.customQuestion || '');
                  setEditSecAnswer('');
                  setIsEditSecQuestionOpen(true);
                }}
              >
                {t('security.editSecurityQuestion')}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="destructive"
              className="w-full h-9 text-xs cursor-pointer"
              onClick={() => {
                disableLock();
                setIsLockSettingsModalOpen(false);
                toast.show(t('security.disableLockSuccess'));
              }}
            >
              {t('security.disableLock')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 變更安全性問題次級彈窗 (平級 Sibling Node) */}
      <Dialog open={isEditSecQuestionOpen} onOpenChange={setIsEditSecQuestionOpen}>
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] sm:max-w-[340px] max-w-[340px] p-5 gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <HelpCircle className="size-5 text-primary" />
              <span>{t('security.editSecurityQuestion')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              {t('security.securityQuestionDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('security.selectSecurityQuestion')}
              </label>
              <Select
                value={editSecQuestionId}
                onValueChange={(val) => val && setEditSecQuestionId(val)}
              >
                <SelectTrigger className="w-full h-9 text-xs">
                  <SelectValue
                    className="truncate text-left flex-1"
                    placeholder={t('security.selectSecurityQuestion')}
                  >
                    {getSecurityQuestionLabel(editSecQuestionId)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="q_pet">{t('security.questions.q_pet')}</SelectItem>
                  <SelectItem value="q_school">{t('security.questions.q_school')}</SelectItem>
                  <SelectItem value="q_city">{t('security.questions.q_city')}</SelectItem>
                  <SelectItem value="q_movie">{t('security.questions.q_movie')}</SelectItem>
                  <SelectItem value="q_friend">{t('security.questions.q_friend')}</SelectItem>
                  <SelectItem value="custom">{t('security.questions.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editSecQuestionId === 'custom' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {t('security.customQuestionLabel')}
                </label>
                <Input
                  placeholder={t('security.customQuestionPlaceholder')}
                  value={editCustomQuestion}
                  onChange={(e) => setEditCustomQuestion(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('security.securityAnswerLabel')}
              </label>
              <Input
                placeholder={t('security.securityAnswerPlaceholder')}
                value={editSecAnswer}
                onChange={(e) => setEditSecAnswer(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <Button
              className="w-full h-9 text-xs mt-2 cursor-pointer"
              onClick={handleSaveEditSecurityQuestion}
            >
              {t('common.confirm', '確認儲存')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Selection Modal (Q5: Ledger-centric Choice Modal) */}
      <Dialog open={isRestoreModalOpen} onOpenChange={setIsRestoreModalOpen}>
        <DialogContent className="sm:max-w-[440px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              {t('settings.restoreDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('settings.restoreFoundLedgers', {
                count: pendingBackup?.ledgersData.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>

          {/* List of identified ledgers */}
          <div className="max-h-[180px] overflow-y-auto border border-border rounded-lg bg-card divide-y divide-border">
            {pendingBackup?.ledgersData.map(({ ledger, transactions: txs, accounts: accs, categories: cats }) => (
              <div
                key={ledger.id}
                className="p-3 flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                    <span>{ledger.name}</span>
                    {ledger.isDefault && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase font-mono tracking-wider">
                        Default
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{ledger.baseCurrency}</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {t('settings.restoreSummary', { txCount: txs?.length ?? 0, accCount: accs?.length ?? 0, catCount: cats?.length ?? 0 })}
                </div>
              </div>
            ))}
          </div>

          {/* Card-style choice: Merge vs Overwrite */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isRestoring}
              onClick={() => executeRestore('merge')}
              className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/40 transition-colors text-left flex items-start gap-3 cursor-pointer group"
            >
              <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <GitMerge className="size-4 text-foreground" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground flex items-center justify-between">
                  <span>{t('settings.restoreMergeTitle')}</span>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {t('settings.recommended')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                  {t('settings.restoreMergeDesc')}
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={isRestoring}
              onClick={() => executeRestore('overwrite')}
              className="w-full p-3 rounded-lg border border-destructive/30 hover:bg-destructive/5 hover:border-destructive/60 transition-colors text-left flex items-start gap-3 cursor-pointer group"
            >
              <div className="size-8 rounded-md bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="size-4 text-destructive" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-destructive">
                  {t('settings.restoreOverwriteTitle')}
                </div>
                <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                  {t('settings.restoreOverwriteDesc')}
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* High-Risk Clear Data Confirmation Modal */}
      <Dialog open={isClearModalOpen} onOpenChange={setIsClearModalOpen}>
        <DialogContent className="sm:max-w-[350px] max-w-[350px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              <span>{t('settings.clearModalTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              {t('settings.clearModalWarning')}
            </DialogDescription>
          </DialogHeader>

          {/* Forced Auto-Backup Notice */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex items-start gap-2.5">
            <ShieldAlert className="size-4 text-primary shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              {t('settings.clearAutoBackupNotice')}
            </span>
          </div>

          {/* Phrase Verification Input */}
          <div className="space-y-2 pt-1">
            <label className="text-xs text-muted-foreground block">
              {t('settings.typeToConfirmClear')}{' '}
              <span className="font-mono text-destructive font-bold select-all bg-destructive/10 px-1 py-0.5 rounded">
                {requiredClearPhrase}
              </span>{' '}
              {t('settings.toConfirmClearAction')}
            </label>
            <Input
              value={clearConfirmationInput}
              onChange={(e) => setClearConfirmationInput(e.target.value)}
              placeholder={requiredClearPhrase}
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && clearConfirmationInput.trim() === requiredClearPhrase && !isClearing) {
                  handleInitiateClear();
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsClearModalOpen(false)}
              disabled={isClearing}
              className="cursor-pointer"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleInitiateClear}
              disabled={clearConfirmationInput.trim() !== requiredClearPhrase || isClearing}
              className="cursor-pointer"
            >
              {t('settings.proceedClearWithBackup')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
