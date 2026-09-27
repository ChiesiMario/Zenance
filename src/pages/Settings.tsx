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
  UploadCloud,
  Trash2,
  GitMerge,
  AlertTriangle,
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
import {
  db,
  type Ledger,
  type Account,
  type Category,
  type Budget,
  type BudgetRule,
  type Transaction,
} from '@/services/db/db';

interface LedgerBackupItem {
  ledger: Ledger;
  accounts: Account[];
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
  const { isSyncing, setSyncing, lastSyncTime, setLastSyncTime, activeLedgerId, setActiveLedgerId } =
    useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // High-Risk Clear Data Confirmation Modal State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationInput, setClearConfirmationInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // Dropbox integration state (placeholder until cloud provider is linked)
  const isAuthenticated = false;

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

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setSyncing(true);
    try {
      await new Promise((res) => setTimeout(res, 1000));
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      toast.show(t('settings.syncNow') + ' ' + t('common.success', '完成'));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Export all ledgers and related entities into a ledger-isolated ZIP archive
   */
  const handleExport = async () => {
    try {
      const [ledgers, allTransactions, allCategories, allAccounts, allBudgets, allBudgetRules] =
        await Promise.all([
          db.ledgers.toArray(),
          db.transactions.toArray(),
          db.categories.toArray(),
          db.accounts.toArray(),
          db.budgets.toArray(),
          db.budget_rules.toArray(),
        ]);

      const zip = new JSZip();
      const manifestLedgers = [];
      const ledgersFolder = zip.folder('ledgers');

      for (const ledger of ledgers) {
        const ledgerFolder = ledgersFolder!.folder(ledger.id);

        const accounts = allAccounts.filter((a) => a.ledgerId === ledger.id);
        const cats = allCategories.filter((c) => c.ledgerId === ledger.id);
        const budgets = allBudgets.filter((b) => b.ledgerId === ledger.id);
        const budgetRules = allBudgetRules.filter((r) => r.ledgerId === ledger.id);
        const txs = allTransactions.filter((t) => t.ledgerId === ledger.id);

        ledgerFolder!.file('ledger.json', JSON.stringify(ledger, null, 2));
        ledgerFolder!.file('accounts.json', JSON.stringify(accounts, null, 2));
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
          const categoriesFile = lFolder.file('categories.json');
          const budgetsFile = lFolder.file('budgets.json');
          const budgetRulesFile = lFolder.file('budget_rules.json');
          const transactionsFile = lFolder.file('transactions.json');

          const accounts = accountsFile ? JSON.parse(await accountsFile.async('text')) : [];
          const cats = categoriesFile ? JSON.parse(await categoriesFile.async('text')) : [];
          const budgets = budgetsFile ? JSON.parse(await budgetsFile.async('text')) : [];
          const budgetRules = budgetRulesFile ? JSON.parse(await budgetRulesFile.async('text')) : [];
          const txs = transactionsFile ? JSON.parse(await transactionsFile.async('text')) : [];

          ledgersData.push({
            ledger: ledgerJson,
            accounts,
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
          categories: cats = [],
          budgets = [],
          budget_rules = [],
          transactions: txs = [],
        } = raw.data;

        if (!Array.isArray(ledgers) || ledgers.length === 0) {
          toast.show(t('settings.importInvalidFile'));
          return;
        }

        const ledgersData: LedgerBackupItem[] = ledgers.map((l: Ledger) => ({
          ledger: l,
          accounts: accounts.filter((a: Account) => a.ledgerId === l.id),
          categories: cats.filter((c: Category) => c.ledgerId === l.id),
          budgets: budgets.filter((b: Budget) => b.ledgerId === l.id),
          budgetRules: budget_rules.filter((r: BudgetRule) => r.ledgerId === l.id),
          transactions: txs.filter((t: Transaction) => t.ledgerId === l.id),
        }));

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
        [db.ledgers, db.transactions, db.categories, db.accounts, db.budgets, db.budget_rules],
        async () => {
          if (mode === 'overwrite') {
            await Promise.all([
              db.ledgers.clear(),
              db.transactions.clear(),
              db.categories.clear(),
              db.accounts.clear(),
              db.budgets.clear(),
              db.budget_rules.clear(),
            ]);
          }

          for (const item of pendingBackup.ledgersData) {
            if (item.ledger) await db.ledgers.put(item.ledger);
            if (item.accounts?.length) await db.accounts.bulkPut(item.accounts);
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
        [db.ledgers, db.transactions, db.categories, db.accounts, db.budgets, db.budget_rules],
        async () => {
          await Promise.all([
            db.ledgers.clear(),
            db.transactions.clear(),
            db.categories.clear(),
            db.accounts.clear(),
            db.budgets.clear(),
            db.budget_rules.clear(),
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
              {isAuthenticated ? t('settings.connected') : t('settings.disconnected')}
            </span>
          </div>

          {isAuthenticated && (
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium">{t('settings.lastSync')}</span>
              <span className="text-sm font-mono text-muted-foreground">
                {lastSyncTime || t('settings.never')}
              </span>
            </div>
          )}

          <div className="p-4 bg-muted/10">
            {!isAuthenticated ? (
              <Button
                className="w-full cursor-pointer"
                onClick={() => toast.show(t('settings.connectNotice'))}
              >
                {t('settings.connectDropbox')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  disabled={isSyncing}
                  onClick={handleSyncNow}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? t('settings.syncing') : t('settings.syncNow')}
                </Button>
                <Button variant="destructive" className="flex-1 cursor-pointer">
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Preferences Container (Theme, Language) */}
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
