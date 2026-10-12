import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAppStore } from '@/store/useAppStore';
import { generateBackupZipBlob } from '@/services/storage/opfsBackupService';
import {
  db,
  type Ledger,
  type Category,
  type Budget,
  type BudgetRule,
  type Transaction,
} from '@/services/db/db';
import type { ParsedBackup, LedgerBackupItem } from '../types';

interface UseBackupRestoreParams {
  loadOpfsBackupForRestore: (filename: string) => Promise<any>;
}

export function useBackupRestore({ loadOpfsBackupForRestore }: UseBackupRestoreParams) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { activeLedgerId, setActiveLedgerId } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Clear Data Modal State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationInput, setClearConfirmationInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';

  // 取得多語系對應之危險清空驗證詞
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
   * 匯出完整 ZIP 備份檔
   */
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
   * 解析上傳之備份檔案（支援 ZIP 與舊版單一 JSON）
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

          let txs: Transaction[] = [];
          const txFolder = lFolder.folder('transactions');
          if (txFolder) {
            const txFileNames: string[] = [];
            txFolder.forEach((relPath, f) => {
              if (relPath.endsWith('.json') && !relPath.endsWith('manifest.json') && !f.dir) {
                txFileNames.push(relPath);
              }
            });
            for (const tfName of txFileNames) {
              const tf = txFolder.file(tfName);
              if (tf) {
                try {
                  const parsedChunk = JSON.parse(await tf.async('text'));
                  if (Array.isArray(parsedChunk)) {
                    txs.push(...parsedChunk);
                  }
                } catch (err) {
                  console.warn(`Failed to parse transaction chunk ${tfName}:`, err);
                }
              }
            }
          } else {
            const transactionsFile = lFolder.file('transactions.json');
            if (transactionsFile) {
              try {
                txs = JSON.parse(await transactionsFile.async('text')) || [];
              } catch (err) {
                console.warn('Failed to parse legacy transactions.json:', err);
              }
            }
          }

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
        // 相容舊版單一 JSON 備份檔
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
   * 執行還原：累加覆蓋 (merge) 或 完整覆蓋 (overwrite)
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
        [
          db.ledgers,
          db.transactions,
          db.categories,
          db.accounts,
          db.contacts,
          db.budgets,
          db.budget_rules,
          db.balance_snapshots,
        ],
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

      // 檢查目前啟用的帳本是否依然有效
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
   * 從本機 OPFS 時光機快照載入並開啟還原彈窗
   */
  const handleRestoreFromOpfs = async (filename: string) => {
    try {
      const parsed = await loadOpfsBackupForRestore(filename);
      if (!parsed) {
        toast.show(t('settings.snapshotParseFailed'));
        return;
      }
      setPendingBackup(parsed as ParsedBackup);
      setIsRestoreModalOpen(true);
    } catch {
      toast.show(t('settings.snapshotReadFailed'));
    }
  };

  /**
   * 啟動出廠級物理清空：
   * 1. 強制自動生成並下載備份
   * 2. 二次警告確認 (useConfirm)
   * 3. 物理清空 IndexedDB 與 LocalStorage
   */
  const handleInitiateClear = async () => {
    if (clearConfirmationInput.trim() !== requiredClearPhrase || isClearing) return;
    setIsClearing(true);

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
      return;
    }

    setIsClearModalOpen(false);
    setClearConfirmationInput('');

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

    try {
      await db.transaction(
        'rw',
        [
          db.ledgers,
          db.transactions,
          db.categories,
          db.accounts,
          db.contacts,
          db.budgets,
          db.budget_rules,
          db.balance_snapshots,
        ],
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

  return {
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
  };
}
