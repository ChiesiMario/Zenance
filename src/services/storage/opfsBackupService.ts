import { db, type Ledger, type Wallet, type Contact, type Category, type Budget, type BudgetRule, type Transaction } from '@/services/db/db';
import { groupTransactionsByMonth } from '@/services/sync/syncEngine';
import { formatBytes, isSecureEnvironment } from './storageManager';

const OPFS_DIR_NAME = 'zenance_backups';
const OPFS_META_KEY = 'zenance_opfs_rolling_meta';

export type RollingBackupTier = 'daily' | 'weekly' | 'monthly';

export interface RollingSnapshotMeta {
  tier: RollingBackupTier;
  filename: string;
  date: string; // YYYY-MM-DD
  size: number;
  sizeFormatted: string;
  updatedAt: string; // ISO
}

export interface RollingBackupsStorageMeta {
  daily?: RollingSnapshotMeta;
  weekly?: RollingSnapshotMeta;
  monthly?: RollingSnapshotMeta;
}

export interface ParsedZipLedgerItem {
  ledger: Ledger;
  accounts: Wallet[];
  contacts: Contact[];
  categories: Category[];
  budgets: Budget[];
  budgetRules: BudgetRule[];
  transactions: Transaction[];
}

export interface ParsedZipBackup {
  manifest?: any;
  ledgersData: ParsedZipLedgerItem[];
}

/**
 * 檢測當前瀏覽器環境是否原生支援 OPFS (Origin Private File System)
 */
export function isOPFSSupported(): boolean {
  if (!isSecureEnvironment()) return false;
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
}

/**
 * 取得 OPFS 備份私有目錄控制代碼 (Handle)
 */
async function getBackupsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOPFSSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
  } catch (err) {
    console.warn('Failed to access OPFS backup directory:', err);
    return null;
  }
}

/**
 * 將當前 IndexedDB 全庫完整打包生成標準分區 ZIP Blob (與手動導出 100% 同構)
 */
export async function generateBackupZipBlob(): Promise<Blob> {
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

  const JSZip = (await import('jszip')).default;
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

    // 按月分卷寫入交易
    const txFolder = ledgerFolder!.folder('transactions');
    const groupedTxs = groupTransactionsByMonth(txs);
    const bucketManifestData: Record<string, { count: number; totalCount: number; updatedAt: string }> = {};

    for (const [bucket, bucketTxs] of Object.entries(groupedTxs)) {
      txFolder!.file(`${bucket}.json`, JSON.stringify(bucketTxs, null, 2));
      const maxBucketUpdated = bucketTxs.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), '');
      bucketManifestData[bucket] = {
        count: bucketTxs.filter((t) => !t.deleted).length,
        totalCount: bucketTxs.length,
        updatedAt: maxBucketUpdated,
      };
    }

    txFolder!.file(
      'manifest.json',
      JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          buckets: bucketManifestData,
        },
        null,
        2
      )
    );

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

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * 解析 ZIP Blob 為還原所需的資料結構
 */
export async function parseBackupZipBlob(blob: Blob): Promise<ParsedZipBackup | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    const manifestFile = zip.file('manifest.json');
    const manifest = manifestFile ? JSON.parse(await manifestFile.async('text')) : null;

    const ledgersData: ParsedZipLedgerItem[] = [];
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

      const accounts = accountsFile ? JSON.parse(await accountsFile.async('text')) : [];
      const contacts = contactsFile ? JSON.parse(await contactsFile.async('text')) : [];
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

      ledgersData.push({
        ledger: ledgerJson,
        accounts,
        contacts,
        categories: cats,
        budgets,
        budgetRules,
        transactions: txs,
      });
    }

    if (ledgersData.length === 0) return null;
    return { manifest, ledgersData };
  } catch (err) {
    console.error('Failed to parse backup zip blob:', err);
    return null;
  }
}

/**
 * 讀取本地儲存的滾動快照元數據字典
 */
export function getRollingBackupsMeta(): RollingBackupsStorageMeta {
  try {
    const raw = localStorage.getItem(OPFS_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setRollingBackupsMeta(meta: RollingBackupsStorageMeta): void {
  localStorage.setItem(OPFS_META_KEY, JSON.stringify(meta));
}

/**
 * 寫入實體檔案至 OPFS 私有虛擬磁碟 (零彈窗、靜默流式寫入)
 */
async function writeOpfsFile(filename: string, blob: Blob): Promise<void> {
  const dir = await getBackupsDirectory();
  if (!dir) throw new Error('OPFS not available');

  const fileHandle = await dir.getFileHandle(filename, { create: true });
  // @ts-ignore createWritable is part of modern FileSystemFileHandle
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * 從 OPFS 私有虛擬磁碟讀取實體檔案 Blob
 */
export async function readOpfsFile(filename: string): Promise<Blob | null> {
  const dir = await getBackupsDirectory();
  if (!dir) return null;

  try {
    const fileHandle = await dir.getFileHandle(filename);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/**
 * 執行 GFS 經典三級輪換滾動自動備份 (每日最多執行 1 次)
 * @param force 是否忽略每日一次的頻率限制強制執行
 */
export async function performRollingBackup(force = false): Promise<boolean> {
  if (!isOPFSSupported()) return false;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const meta = getRollingBackupsMeta();

  // 若今日已執行過日度備份且非強制，跳過避免無謂寫入
  if (!force && meta.daily?.date === todayStr) {
    return false;
  }

  try {
    // 1. 打包當前全庫狀態
    const zipBlob = await generateBackupZipBlob();
    const size = zipBlob.size;
    const sizeFormatted = formatBytes(size);

    // 2. 寫入 [子] 昨日快照 (backup-daily.zip)
    const dailyFilename = 'backup-daily.zip';
    await writeOpfsFile(dailyFilename, zipBlob);
    meta.daily = {
      tier: 'daily',
      filename: dailyFilename,
      date: todayStr,
      size,
      sizeFormatted,
      updatedAt: nowIso,
    };

    // 3. 檢查是否需要更新 [父] 上週快照 (backup-weekly.zip，逢週一或無記錄時留存)
    const isMonday = now.getDay() === 1;
    const hasNoWeekly = !meta.weekly;
    if (isMonday || hasNoWeekly) {
      const weeklyFilename = 'backup-weekly.zip';
      await writeOpfsFile(weeklyFilename, zipBlob);
      meta.weekly = {
        tier: 'weekly',
        filename: weeklyFilename,
        date: todayStr,
        size,
        sizeFormatted,
        updatedAt: nowIso,
      };
    }

    // 4. 檢查是否需要更新 [祖] 上月快照 (backup-monthly.zip，逢月初 1 號或無記錄時留存)
    const isFirstDayOfMonth = now.getDate() === 1;
    const hasNoMonthly = !meta.monthly;
    if (isFirstDayOfMonth || hasNoMonthly) {
      const monthlyFilename = 'backup-monthly.zip';
      await writeOpfsFile(monthlyFilename, zipBlob);
      meta.monthly = {
        tier: 'monthly',
        filename: monthlyFilename,
        date: todayStr,
        size,
        sizeFormatted,
        updatedAt: nowIso,
      };
    }

    setRollingBackupsMeta(meta);
    return true;
  } catch (err) {
    console.error('Failed to perform OPFS rolling backup:', err);
    return false;
  }
}

/**
 * 取得當前可用的時光機快照清單
 */
export function getAvailableRollingSnapshots(): Array<{
  id: RollingBackupTier;
  title: string;
  filename: string;
  date: string;
  sizeFormatted: string;
  updatedAt: string;
}> {
  const meta = getRollingBackupsMeta();
  const list: Array<{
    id: RollingBackupTier;
    title: string;
    filename: string;
    date: string;
    sizeFormatted: string;
    updatedAt: string;
  }> = [];

  if (meta.daily) {
    list.push({
      id: 'daily',
      title: '昨日快照',
      filename: meta.daily.filename,
      date: meta.daily.date,
      sizeFormatted: meta.daily.sizeFormatted,
      updatedAt: meta.daily.updatedAt,
    });
  }

  if (meta.weekly) {
    list.push({
      id: 'weekly',
      title: '上週快照',
      filename: meta.weekly.filename,
      date: meta.weekly.date,
      sizeFormatted: meta.weekly.sizeFormatted,
      updatedAt: meta.weekly.updatedAt,
    });
  }

  if (meta.monthly) {
    list.push({
      id: 'monthly',
      title: '上月快照',
      filename: meta.monthly.filename,
      date: meta.monthly.date,
      sizeFormatted: meta.monthly.sizeFormatted,
      updatedAt: meta.monthly.updatedAt,
    });
  }

  return list;
}

/**
 * 將 OPFS 裡的備份快照檔案另存到使用者的電腦下載資料夾中
 */
export async function downloadRollingBackupFile(filename: string): Promise<boolean> {
  const blob = await readOpfsFile(filename);
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `zenance-${filename.replace('.zip', '')}-${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

let autoBackupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 安排背景閒置自動滾動備份 (防抖 8 秒)
 */
export function scheduleRollingBackup(delayMs = 8000): void {
  if (!isOPFSSupported()) return;

  if (autoBackupTimer) {
    clearTimeout(autoBackupTimer);
  }

  autoBackupTimer = setTimeout(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        performRollingBackup(false);
      }, { timeout: 10000 });
    } else {
      performRollingBackup(false);
    }
  }, delayMs);
}
