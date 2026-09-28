import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  RefreshCw,
  Globe,
  Moon,
  Tags,
  SlidersHorizontal,
  Download,
  Upload,
  UploadCloud,
  Trash2,
  GitMerge,
  AlertTriangle,
  ShieldCheck,
  Fingerprint,
  KeyRound,
  Copy,
  Check,
  Database,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Logo } from '@/components/ui/Logo';
import { useTheme } from '@/components/ThemeProvider';
import { useAppStore } from '@/store/useAppStore';
import { useCategories } from '@/hooks/useCategories';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { useAppLockStore } from '@/store/useAppLockStore';
import { useStorageStatus } from '@/hooks/useStorageStatus';
import { isE2EEEnabled, setupE2EE, disableE2EE } from '@/services/crypto/e2eeManager';
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
  const { activeLedgerId, setActiveLedgerId } = useAppStore();
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
    firstConnectModalOpen,
    setFirstConnectModalOpen,
    localRecordCount,
    remoteRecordCount,
    connectDropbox,
    disconnectDropbox,
    syncNow,
    resolveFirstConnectConflict,
  } = useDropboxSync();

  // App Lock security store
  const {
    isLockConfigured,
    config: appLockConfig,
    hasBiometricHardware,
    enableLock,
    updateLockSettings,
    disableLock,
  } = useAppLockStore();

  // Browser Storage & Persistent storage status
  const { isPersisted, estimate, requestPersistence } = useStorageStatus();

  // E2EE modal states
  const [e2eeActive, setE2eeActive] = useState<boolean>(isE2EEEnabled());
  const [isE2eeModalOpen, setIsE2eeModalOpen] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [e2eeConfirmPassphrase, setE2eeConfirmPassphrase] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [isRecoveryCopied, setIsRecoveryCopied] = useState(false);

  // App Lock modal states
  const [isLockSetupModalOpen, setIsLockSetupModalOpen] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockPinConfirm, setLockPinConfirm] = useState('');
  const [lockEnableBio, setLockEnableBio] = useState(true);

  const handleEnableE2EE = async () => {
    if (!e2eePassphrase.trim() || e2eePassphrase.length < 6) {
      toast.show('密碼長度需至少 6 個字元');
      return;
    }
    if (e2eePassphrase !== e2eeConfirmPassphrase) {
      toast.show('兩次輸入的密碼不一致');
      return;
    }
    try {
      const { recoveryKey } = await setupE2EE(e2eePassphrase);
      setGeneratedRecoveryKey(recoveryKey);
      setE2eeActive(true);
      toast.show('端到端加密已成功啟用！');

      // 啟用加密後立即以端到端加密重新推送 Dropbox 雲端上的所有備份
      if (isAuthenticated && isOnline) {
        syncNow('overwrite_remote');
      }
    } catch (err: any) {
      toast.show('啟用失敗：' + (err?.message || '未知錯誤'));
    }
  };

  const handleDisableE2EE = async () => {
    disableE2EE();
    setE2eeActive(false);
    toast.show('已停用端到端加密');

    // 停用加密後立即將雲端備份覆蓋還原為標準明文格式
    if (isAuthenticated && isOnline) {
      syncNow('overwrite_remote');
    }
  };

  const handleSavePinLock = async () => {
    if (lockPinInput.length < 4) {
      toast.show('PIN 碼需至少 4 位數');
      return;
    }
    if (lockPinInput !== lockPinConfirm) {
      toast.show('兩次輸入的 PIN 碼不一致');
      return;
    }
    const success = await enableLock(lockPinInput, lockEnableBio, 0);
    if (success) {
      setIsLockSetupModalOpen(false);
      setLockPinInput('');
      setLockPinConfirm('');
      toast.show('安全鎖已成功啟用');
    } else {
      toast.show('啟用安全鎖失敗');
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistence();
    toast.show(granted ? '已獲得瀏覽器持久化儲存授權！' : '瀏覽器未授權持久化，將依設備容量自動管理');
  };

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

  /**
   * Export all ledgers and related entities into a ledger-isolated ZIP archive
   */
  const handleExport = async () => {
    try {
      const [ledgers, allTransactions, allCategories, allAccounts, allContacts, allBudgets, allBudgetRules] =
        await Promise.all([
          db.ledgers.toArray(),
          db.transactions.toArray(),
          db.categories.toArray(),
          db.accounts.toArray(),
          db.contacts.toArray(),
          db.budgets.toArray(),
          db.budget_rules.toArray(),
        ]);

      const zip = new JSZip();
      const manifestLedgers = [];
      const ledgersFolder = zip.folder('ledgers');

      for (const ledger of ledgers) {
        const ledgerFolder = ledgersFolder!.folder(ledger.id);

        const accounts = allAccounts.filter((a) => a.ledgerId === ledger.id);
        const contacts = allContacts.filter((c) => c.ledgerId === ledger.id);
        const cats = allCategories.filter((c) => c.ledgerId === ledger.id);
        const budgets = allBudgets.filter((b) => b.ledgerId === ledger.id);
        const budgetRules = allBudgetRules.filter((r) => r.ledgerId === ledger.id);
        const txs = allTransactions.filter((t) => t.ledgerId === ledger.id);

        ledgerFolder!.file('ledger.json', JSON.stringify(ledger, null, 2));
        ledgerFolder!.file('accounts.json', JSON.stringify(accounts, null, 2));
        ledgerFolder!.file('contacts.json', JSON.stringify(contacts, null, 2));
        ledgerFolder!.file('categories.json', JSON.stringify(cats, null, 2));
        ledgerFolder!.file('budgets.json', JSON.stringify(budgets, null, 2));
        ledgerFolder!.file('budget_rules.json', JSON.stringify(budgetRules, null, 2));
        ledgerFolder!.file('transactions.json', JSON.stringify(txs, null, 2));

        manifestLedgers.push({
          id: ledger.id,
          name: ledger.name,
          baseCurrency: ledger.baseCurrency,
          isDefault: ledger.isDefault,
          stats: {
            accountsCount: accounts.length,
            contactsCount: contacts.length,
            categoriesCount: cats.length,
            budgetsCount: budgets.length,
            budgetRulesCount: budgetRules.length,
            transactionsCount: txs.length,
          },
        });
      }

      const manifest = {
        appName: 'Zenance',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        totalLedgers: ledgers.length,
        ledgers: manifestLedgers,
      };

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
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
      toast.show('匯出失敗，請重試');
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
          const transactionsFile = lFolder.file('transactions.json');

          const rawAccounts = accountsFile ? JSON.parse(await accountsFile.async('text')) : [];
          const rawContacts = contactsFile ? JSON.parse(await contactsFile.async('text')) : [];
          const cats = categoriesFile ? JSON.parse(await categoriesFile.async('text')) : [];
          const budgets = budgetsFile ? JSON.parse(await budgetsFile.async('text')) : [];
          const budgetRules = budgetRulesFile ? JSON.parse(await budgetRulesFile.async('text')) : [];
          const txs = transactionsFile ? JSON.parse(await transactionsFile.async('text')) : [];

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
      toast.show('還原失敗，請重試');
    } finally {
      setIsRestoring(false);
    }
  };

  /**
   * Execute Factory Reset: Wipe all IndexedDB data and localStorage completely
   */
  const handleExecuteClear = async () => {
    if (clearConfirmationInput.trim() !== requiredClearPhrase || isClearing) return;
    setIsClearing(true);

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
      toast.show('清除失敗，請重試');
      setIsClearing(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      {/* Hidden File Input for Backup Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header Row */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight">{t('settings.settings')}</h2>
      </div>

      {/* 1. Dropbox Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        {/* Header row */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          {isAuthenticated ? (
            <Cloud className="h-6 w-6 text-primary" strokeWidth={1.5} />
          ) : (
            <CloudOff className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          )}
          <div>
            <h3 className="font-medium">{t('settings.dropboxSync')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.backupAndSync')}</p>
          </div>
        </div>

        {/* Status List */}
        <div className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <span className="text-sm font-medium">{t('settings.status')}</span>
            <span className={`text-sm ${isAuthenticated ? 'text-primary' : 'text-muted-foreground'}`}>
              {!isOnline
                ? '離線中（連線後自動同步）'
                : isSyncing
                ? t('settings.syncing')
                : isAuthenticated
                ? t('settings.connected')
                : t('settings.disconnected')}
            </span>
          </div>

          {isAuthenticated && (
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium">{t('settings.lastSync')}</span>
              <span className="text-sm font-mono text-muted-foreground">
                {lastSyncTime
                  ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : t('settings.never')}
              </span>
            </div>
          )}

          {isAuthenticated && (
            <div className="p-4 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium block">端到端加密 (E2EE)</span>
                <span className="text-xs text-muted-foreground">
                  {e2eeActive ? '已啟用 AES-256-GCM 雲端加密保護' : '未啟用，資料以明文存放於雲端'}
                </span>
              </div>
              <div>
                {!e2eeActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer text-xs h-8"
                    onClick={() => {
                      setE2eePassphrase('');
                      setE2eeConfirmPassphrase('');
                      setGeneratedRecoveryKey('');
                      setIsE2eeModalOpen(true);
                    }}
                  >
                    啟用加密
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-xs h-8 text-destructive hover:text-destructive"
                    onClick={handleDisableE2EE}
                  >
                    停用
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-muted/10">
            {!isAuthenticated ? (
              <Button
                className="w-full cursor-pointer"
                disabled={isSyncing}
                onClick={connectDropbox}
              >
                {t('settings.connectDropbox')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  disabled={isSyncing || !isOnline}
                  onClick={() => syncNow()}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? t('settings.syncing') : t('settings.syncNow')}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 cursor-pointer"
                  disabled={isSyncing}
                  onClick={disconnectDropbox}
                >
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Security & Privacy Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.5} />
          <div>
            <h3 className="font-medium text-sm">隱私與安全鎖</h3>
            <p className="text-xs text-muted-foreground">保護本機記帳資料與防止窺探</p>
          </div>
        </div>

        <div className="divide-y divide-border text-sm">
          <div className="p-4 flex items-center justify-between">
            <div>
              <span className="font-medium block">應用程式安全鎖</span>
              <span className="text-xs text-muted-foreground">
                {isLockConfigured ? '已開啟 PIN 碼保護' : '未開啟'}
              </span>
            </div>
            <div>
              {!isLockConfigured ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer text-xs h-8"
                  onClick={() => {
                    setLockPinInput('');
                    setLockPinConfirm('');
                    setIsLockSetupModalOpen(true);
                  }}
                >
                  設定 PIN 碼
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-xs h-8 text-destructive hover:text-destructive"
                  onClick={disableLock}
                >
                  關閉安全鎖
                </Button>
              )}
            </div>
          </div>

          {isLockConfigured && (
            <>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium block">自動鎖定時間</span>
                  <span className="text-xs text-muted-foreground">閒置或切換至後台後自動鎖定</span>
                </div>
                <Select
                  value={String(appLockConfig?.timeoutMinutes ?? 0)}
                  onValueChange={(val) => {
                    if (val) {
                      updateLockSettings({ timeoutMinutes: parseInt(val, 10) });
                    }
                  }}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">立即 (切換即鎖)</SelectItem>
                    <SelectItem value="1">閒置 1 分鐘</SelectItem>
                    <SelectItem value="5">閒置 5 分鐘</SelectItem>
                    <SelectItem value="15">閒置 15 分鐘</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasBiometricHardware && (
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium block flex items-center gap-1.5">
                      <Fingerprint className="size-4 text-primary" />
                      <span>Touch ID / FaceID 解鎖</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      使用本機生物辨識快速解鎖
                    </span>
                  </div>
                  <div>
                    <Button
                      variant={appLockConfig?.biometricEnabled ? 'default' : 'outline'}
                      size="sm"
                      className="cursor-pointer text-xs h-8"
                      onClick={() => {
                        updateLockSettings({ biometricEnabled: !appLockConfig?.biometricEnabled });
                      }}
                    >
                      {appLockConfig?.biometricEnabled ? '已開啟' : '未開啟'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3. Preferences Container (Theme, Language) */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 pl-2">
              <Moon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.theme')}</span>
            </div>
            <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
              <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 bg-transparent text-right justify-end [&>span]:mr-2 text-sm">
                <SelectValue className="flex-none text-right">
                  {getThemeLabel(theme)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
                <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 pl-2">
              <Globe className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.language')}</span>
            </div>
            <Select
              value={currentLang}
              onValueChange={(v) => i18n.changeLanguage(v || 'en')}
            >
              <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 bg-transparent text-right justify-end [&>span]:mr-2 text-sm">
                <SelectValue className="flex-none text-right">
                  {getLanguageLabel(currentLang)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-TW">繁體中文</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 3. Category Management Container (Overview & Link) */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 pl-2">
              <Tags className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.categoryOverview')}</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground pr-2">
              {t('settings.activeAndArchived', { active: activeCount, archived: archivedCount })}
            </span>
          </div>

          <Link
            to="/settings/categories"
            className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 pl-2">
              <SlidersHorizontal className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.manageCategories')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground mr-2" />
          </Link>
        </div>
      </div>

      {/* 4. Data Management Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          <button
            type="button"
            onClick={handleExport}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 pl-2">
              <Download className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.exportData')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground mr-2" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 pl-2">
              <UploadCloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium">{t('settings.importData')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground mr-2" />
          </button>

          {/* 資料庫持久化保護 */}
          <div className="p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3 pl-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <span className="font-medium block">資料庫持久化保護</span>
                <span className="text-xs text-muted-foreground">
                  防止瀏覽器在低儲存或長期閒置時自動清空帳本
                </span>
              </div>
            </div>
            <div>
              {isPersisted ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Check className="size-3" />
                  <span>已受保護</span>
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs cursor-pointer"
                  onClick={handleRequestPersistence}
                >
                  申請保護
                </Button>
              )}
            </div>
          </div>

          {/* 本機儲存空間佔用 */}
          <div className="p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3 pl-2">
              <Database className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <span className="font-medium block">本機儲存空間佔用</span>
                <span className="text-xs text-muted-foreground">
                  IndexedDB 資料庫與離線快取總容量
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-medium text-foreground block">
                {estimate ? `${estimate.usageFormatted} / ${estimate.quotaFormatted}` : '計算中...'}
              </span>
              {estimate && (
                <span className="text-[10px] text-muted-foreground font-mono block">
                  已用 {estimate.percentUsed}%
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setClearConfirmationInput('');
              setIsClearModalOpen(true);
            }}
            className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 pl-2">
              <Trash2 className="h-5 w-5 text-destructive" strokeWidth={1.5} />
              <span className="text-sm font-medium text-destructive">{t('settings.clearData')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground mr-2" />
          </button>
        </div>
      </div>

      {/* App Branding Footer */}
      <div className="flex flex-col items-center justify-center gap-2 pt-6">
        <Logo size={28} />
        <span className="text-xs text-muted-foreground font-mono">Zenance v1.0.0</span>
      </div>

      {/* 首次連線資料衝突選擇彈窗 (Q1 選項 B) */}
      <Dialog open={firstConnectModalOpen} onOpenChange={setFirstConnectModalOpen}>
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Cloud className="size-5 text-primary" />
              <span>檢測到雲端現存資料</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              雲端檢測到 {remoteRecordCount} 筆交易記錄，本機現有 {localRecordCount} 筆交易記錄。請選擇首次連線的處理策略：
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => resolveFirstConnectConflict('merge')}
              className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/40 transition-colors text-left flex items-start gap-3 cursor-pointer group"
            >
              <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <GitMerge className="size-4 text-foreground" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground flex items-center justify-between">
                  <span>保留雙方所有資料（智能合併）</span>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    推薦
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                  自動融合本機與雲端的記錄，若有修改以最新時間戳為準。
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => resolveFirstConnectConflict('overwrite_local')}
              className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left flex items-start gap-3 cursor-pointer group"
            >
              <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Download className="size-4 text-foreground" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  以雲端資料覆蓋本機
                </div>
                <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                  清空本機資料庫，完全採用雲端的記錄。
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => resolveFirstConnectConflict('overwrite_remote')}
              className="w-full p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left flex items-start gap-3 cursor-pointer group"
            >
              <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Upload className="size-4 text-foreground" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  以本機資料覆蓋雲端
                </div>
                <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                  以本機資料為準，完全覆寫雲端同步檔。
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 端到端加密設定彈窗 */}
      <Dialog open={isE2eeModalOpen} onOpenChange={setIsE2eeModalOpen}>
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              <span>啟用端到端加密 (E2EE)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              設定一組同步金鑰密碼。資料在離開本機前將以 AES-256-GCM 加密，雲端伺服器僅儲存密文。
            </DialogDescription>
          </DialogHeader>

          {!generatedRecoveryKey ? (
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  設定加密密碼（至少 6 位）
                </label>
                <Input
                  type="password"
                  placeholder="輸入密碼..."
                  value={e2eePassphrase}
                  onChange={(e) => setE2eePassphrase(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  再次確認密碼
                </label>
                <Input
                  type="password"
                  placeholder="再次輸入密碼..."
                  value={e2eeConfirmPassphrase}
                  onChange={(e) => setE2eeConfirmPassphrase(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <Button
                className="w-full h-9 text-xs mt-2 cursor-pointer"
                onClick={handleEnableE2EE}
              >
                立即啟用
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-primary uppercase tracking-wider">
                  緊急救援金鑰 (Recovery Key)
                </span>
                <p className="text-xs font-mono font-bold text-foreground select-all break-all py-1">
                  {generatedRecoveryKey}
                </p>
                <span className="text-[10px] text-muted-foreground leading-normal">
                  請將此金鑰妥善保存在密碼管理器或實體紙張上。若遺忘密碼，這是解鎖雲端帳本的唯一憑證。
                </span>
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
                  <span>{isRecoveryCopied ? '已複製' : '複製救援金鑰'}</span>
                </Button>
                <Button
                  className="flex-1 h-9 text-xs cursor-pointer"
                  onClick={() => setIsE2eeModalOpen(false)}
                >
                  完成
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 應用程式安全鎖 PIN 碼設定彈窗 */}
      <Dialog open={isLockSetupModalOpen} onOpenChange={setIsLockSetupModalOpen}>
        <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <span>設定應用程式安全鎖</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              設定 4~6 位數 PIN 碼，防止他人借用手機或查看多工後台時窺探記帳隱私。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                設定 PIN 碼 (4-6 位數字)
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="輸入 4-6 位數字..."
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, ''))}
                className="h-9 text-xs tracking-widest font-mono text-center"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                確認 PIN 碼
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="再次輸入 PIN 碼..."
                value={lockPinConfirm}
                onChange={(e) => setLockPinConfirm(e.target.value.replace(/\D/g, ''))}
                className="h-9 text-xs tracking-widest font-mono text-center"
              />
            </div>

            {hasBiometricHardware && (
              <div className="p-2.5 rounded-lg border border-border bg-muted/20 flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <Fingerprint className="size-4 text-primary" />
                  <span>支援 Touch ID / FaceID</span>
                </span>
                <input
                  type="checkbox"
                  checked={lockEnableBio}
                  onChange={(e) => setLockEnableBio(e.target.checked)}
                  className="size-4 rounded accent-primary cursor-pointer"
                />
              </div>
            )}

            <Button
              className="w-full h-9 text-xs mt-2 cursor-pointer"
              onClick={handleSavePinLock}
            >
              確認開啟
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
                  {txs?.length ?? 0} 筆交易 · {accs?.length ?? 0} 個帳戶 · {cats?.length ?? 0} 個分類
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
                    推薦
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

          {/* Defensive Backup Shortcut */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              {t('settings.clearBackupPrompt')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="w-full cursor-pointer h-8 text-xs font-medium"
            >
              <Download className="mr-2 size-3.5" />
              {t('settings.downloadBackupBeforeClear')}
            </Button>
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
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && clearConfirmationInput.trim() === requiredClearPhrase) {
                  handleExecuteClear();
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
              onClick={handleExecuteClear}
              disabled={clearConfirmationInput.trim() !== requiredClearPhrase || isClearing}
              className="cursor-pointer"
            >
              {t('settings.confirmClearButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
