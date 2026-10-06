import {
  db,
  type Ledger,
  type Wallet,
  type Contact,
  type Category,
  type Budget,
  type BudgetRule,
  type Transaction,
} from '@/services/db/db';
import {
  listRemoteFolder,
  downloadJsonFile,
  uploadJsonFile,
  deleteRemotePath,
  type DropboxFileMetadata,
} from './dropboxClient';
import { isDropboxConnected } from './dropboxAuth';
import {
  getE2EEConfig,
  isE2EEEnabled,
  isE2EEUnlocked,
  getE2EEUpdatedAt,
  importRemoteE2EEConfig,
  disableE2EE,
  initE2EEKey,
} from '../crypto/e2eeManager';
import type { CryptoEnvelope } from '../crypto/webCrypto';
import { recordObservedTimestamp } from '@/lib/clock';
import { generateDueMonthlySnapshots } from '@/services/balance/snapshotService';

const LAST_SYNC_KEY = 'zenance_dropbox_last_sync';
const CACHED_REVS_KEY = 'zenance_dropbox_cached_revs';
const TABLE_PUSH_TIME_KEY = 'zenance_dropbox_pushed_times';

export interface SyncResult {
  success: boolean;
  timestamp: string;
  error?: string;
  actionTaken: 'uploaded_initial' | 'merged' | 'downloaded_remote' | 'uploaded_local' | 'up_to_date';
  needsUnlock?: boolean;
}

export type SyncUnlockListener = (mode: 'auto' | 'overwrite_local' | 'overwrite_remote') => void;
const unlockListeners = new Set<SyncUnlockListener>();

export function onSyncUnlockNeeded(listener: SyncUnlockListener): () => void {
  unlockListeners.add(listener);
  return () => {
    unlockListeners.delete(listener);
  };
}

export function triggerSyncUnlockNeeded(mode: 'auto' | 'overwrite_local' | 'overwrite_remote' = 'auto'): void {
  unlockListeners.forEach((fn) => {
    try {
      fn(mode);
    } catch (e) {
      console.error('Error in sync unlock listener:', e);
    }
  });
}

export interface SyncEngineStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  justSynced: boolean;
}

let currentSyncStatus: SyncEngineStatus = {
  isSyncing: false,
  lastSyncTime: null,
  lastSyncError: null,
  justSynced: false,
};

const syncStatusListeners = new Set<(status: SyncEngineStatus) => void>();
let justSyncedTimer: ReturnType<typeof setTimeout> | null = null;

export function getSyncEngineStatus(): SyncEngineStatus {
  if (currentSyncStatus.lastSyncTime === null) {
    currentSyncStatus.lastSyncTime = getLastSyncTime();
  }
  return { ...currentSyncStatus };
}

export function updateSyncEngineStatus(patch: Partial<SyncEngineStatus>): void {
  currentSyncStatus = { ...currentSyncStatus, ...patch };
  syncStatusListeners.forEach((fn) => {
    try {
      fn(currentSyncStatus);
    } catch (e) {
      console.error('Error in sync status listener:', e);
    }
  });
}

export function onSyncEngineStatusChange(listener: (status: SyncEngineStatus) => void): () => void {
  syncStatusListeners.add(listener);
  listener(getSyncEngineStatus());
  return () => {
    syncStatusListeners.delete(listener);
  };
}

export interface SyncManifestLedgerStats {
  accountsCount: number;
  contactsCount: number;
  categoriesCount: number;
  budgetsCount: number;
  budgetRulesCount: number;
  transactionsCount: number;
}

export interface SyncManifestLedgerItem {
  id: string;
  name: string;
  baseCurrency: string;
  isDefault: boolean;
  stats: SyncManifestLedgerStats;
}

export interface SyncManifestE2EE {
  enabled: boolean;
  updatedAt: string;
  salt?: string;
  verification?: CryptoEnvelope;
}

export interface SyncManifest {
  appName: string;
  schemaVersion: number;
  exportedAt: string;
  totalLedgers: number;
  ledgers: SyncManifestLedgerItem[];
  deletedLedgerIds?: string[];
  e2ee?: SyncManifestE2EE;
}

export interface TransactionsBucketInfo {
  count: number;
  totalCount: number;
  updatedAt: string;
}

export interface TransactionsBucketManifest {
  version: number;
  updatedAt: string;
  buckets: Record<string, TransactionsBucketInfo>;
}

export function getTransactionMonthBucket(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) {
    return 'unknown';
  }
  return dateStr.slice(0, 7);
}

export function groupTransactionsByMonth(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    const bucket = getTransactionMonthBucket(tx.date);
    if (!groups[bucket]) {
      groups[bucket] = [];
    }
    groups[bucket].push(tx);
  }
  return groups;
}

let isSyncInProgress = false;
let hasPendingSyncRequest = false;
let pendingSyncMode: 'auto' | 'overwrite_local' | 'overwrite_remote' = 'auto';
let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * 遠端交易合併後，背景無感補齊受影響帳本的歷史結算月份餘額快照
 */
export async function reconcileMonthlySnapshotsForLedger(ledgerId: string): Promise<void> {
  try {
    const ledger = await db.ledgers.get(ledgerId);
    if (!ledger) return;

    const rates = await db.exchange_rates.toArray();
    const getRate = (fromCurrency: string, toCurrency: string): number => {
      if (fromCurrency === toCurrency) return 1;
      if (!rates || rates.length === 0) return 1;
      const fromRate = rates.find((r) => r.currency === fromCurrency)?.rate || 1;
      const toRate = rates.find((r) => r.currency === toCurrency)?.rate || 1;
      return toRate / fromRate;
    };

    await generateDueMonthlySnapshots(ledgerId, getRate, ledger.baseCurrency || 'CNY');
  } catch (err) {
    console.warn(`Failed to reconcile monthly snapshots for ledger ${ledgerId}:`, err);
  }
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

export function setLastSyncTime(isoTime: string): void {
  localStorage.setItem(LAST_SYNC_KEY, isoTime);
  updateSyncEngineStatus({ lastSyncTime: isoTime });
}

export function getCachedRevs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHED_REVS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCachedRevs(revs: Record<string, string>): void {
  localStorage.setItem(CACHED_REVS_KEY, JSON.stringify(revs));
}

export function getPushedTimes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TABLE_PUSH_TIME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setPushedTimes(times: Record<string, string>): void {
  localStorage.setItem(TABLE_PUSH_TIME_KEY, JSON.stringify(times));
}

/**
 * 核心演算法：支援邏輯版本號 (rev) 與時間戳雙重防護的 LWW 合併
 * 優先依據 rev 裁決，徹底免疫多設備系統時鐘偏差
 */
export function mergeEntities<T extends { id: string; updatedAt?: string; rev?: number; deleted?: boolean }>(
  localList: T[],
  remoteList: T[]
): { merged: T[]; hasLocalChanges: boolean; hasRemoteChanges: boolean } {
  const localMap = new Map<string, T>(localList.map((item) => [item.id, item]));
  const remoteMap = new Map<string, T>(remoteList.map((item) => [item.id, item]));
  const mergedMap = new Map<string, T>();

  let hasLocalChanges = false;
  let hasRemoteChanges = false;

  for (const localItem of localList) {
    const remoteItem = remoteMap.get(localItem.id);
    if (!remoteItem) {
      mergedMap.set(localItem.id, localItem);
      hasRemoteChanges = true;
    } else {
      const localRev = localItem.rev || 1;
      const remoteRev = remoteItem.rev || 1;
      const localTime = localItem.updatedAt || '';
      const remoteTime = remoteItem.updatedAt || '';

      if (remoteTime) recordObservedTimestamp(remoteTime);

      // 1. 優先比對單調遞增邏輯版本號裁決 (防範時鐘快慢偏差)
      if (remoteRev > localRev) {
        mergedMap.set(localItem.id, remoteItem);
        hasLocalChanges = true;
      } else if (localRev > remoteRev) {
        mergedMap.set(localItem.id, localItem);
        hasRemoteChanges = true;
      } else {
        // 2. 版本號相同時（如並行編輯同一初始版本），以安全時間戳為仲裁依據
        if (remoteTime > localTime) {
          mergedMap.set(localItem.id, remoteItem);
          hasLocalChanges = true;
        } else if (localTime > remoteTime) {
          mergedMap.set(localItem.id, localItem);
          hasRemoteChanges = true;
        } else {
          mergedMap.set(localItem.id, localItem);
        }
      }
    }
  }

  for (const remoteItem of remoteList) {
    if (!localMap.has(remoteItem.id)) {
      if (remoteItem.updatedAt) recordObservedTimestamp(remoteItem.updatedAt);
      mergedMap.set(remoteItem.id, remoteItem);
      hasLocalChanges = true;
    }
  }

  return {
    merged: Array.from(mergedMap.values()),
    hasLocalChanges,
    hasRemoteChanges,
  };
}

export async function uploadAllLocalLedgers(
  now: string,
  cachedRevs: Record<string, string>,
  pushedTimes: Record<string, string>
): Promise<void> {
  const ledgers = await db.ledgers.toArray();
  const activeLedgers = ledgers.filter((l) => !l.deleted);
  const deletedLedgers = ledgers.filter((l) => l.deleted);

  for (const l of activeLedgers) {
    const [accs, conts, cats, buds, rules, txs] = await Promise.all([
      db.accounts.where('ledgerId').equals(l.id).toArray(),
      db.contacts.where('ledgerId').equals(l.id).toArray(),
      db.categories.where('ledgerId').equals(l.id).toArray(),
      db.budgets.where('ledgerId').equals(l.id).toArray(),
      db.budget_rules.where('ledgerId').equals(l.id).toArray(),
      db.transactions.where('ledgerId').equals(l.id).toArray(),
    ]);

    const prefix = `/ledgers/${l.id}`;
    cachedRevs[`${prefix}/ledger.json`] = await uploadJsonFile(`${prefix}/ledger.json`, l);
    cachedRevs[`${prefix}/accounts.json`] = await uploadJsonFile(`${prefix}/accounts.json`, accs);
    cachedRevs[`${prefix}/contacts.json`] = await uploadJsonFile(`${prefix}/contacts.json`, conts);
    cachedRevs[`${prefix}/categories.json`] = await uploadJsonFile(`${prefix}/categories.json`, cats);
    cachedRevs[`${prefix}/budgets.json`] = await uploadJsonFile(`${prefix}/budgets.json`, buds);
    cachedRevs[`${prefix}/budget_rules.json`] = await uploadJsonFile(`${prefix}/budget_rules.json`, rules);

    // 交易按月分卷上傳
    const groupedTxs = groupTransactionsByMonth(txs);
    const bucketManifestData: Record<string, TransactionsBucketInfo> = {};

    for (const [bucket, bucketTxs] of Object.entries(groupedTxs)) {
      const bucketPath = `${prefix}/transactions/${bucket}.json`;
      cachedRevs[bucketPath] = await uploadJsonFile(bucketPath, bucketTxs);
      const maxBucketUpdated = bucketTxs.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), '');
      bucketManifestData[bucket] = {
        count: bucketTxs.filter((t) => !t.deleted).length,
        totalCount: bucketTxs.length,
        updatedAt: maxBucketUpdated,
      };
      pushedTimes[`${l.id}_tx_${bucket}`] = now;
      pushedTimes[`${l.id}_tx_${bucket}_count`] = String(bucketTxs.length);
    }

    const txManifestPath = `${prefix}/transactions/manifest.json`;
    const bucketManifest: TransactionsBucketManifest = {
      version: 1,
      updatedAt: now,
      buckets: bucketManifestData,
    };
    cachedRevs[txManifestPath] = await uploadJsonFile(txManifestPath, bucketManifest);

    // 清除遠端可能殘留的舊單體 transactions.json
    await deleteRemotePath(`${prefix}/transactions.json`).catch(() => {});
    delete cachedRevs[`${prefix}/transactions.json`];
    delete pushedTimes[`${l.id}_transactions`];

    pushedTimes[`${l.id}_ledger`] = now;
    pushedTimes[`${l.id}_accounts`] = now;
    pushedTimes[`${l.id}_contacts`] = now;
    pushedTimes[`${l.id}_categories`] = now;
    pushedTimes[`${l.id}_budgets`] = now;
    pushedTimes[`${l.id}_budget_rules`] = now;
  }

  // 物理清除遠端已刪除帳本資料夾，防止雲端目錄殘留垃圾
  for (const d of deletedLedgers) {
    await deleteRemotePath(`/ledgers/${d.id}`).catch(() => {});
  }

  await uploadManifestFile(cachedRevs);
}

/**
 * 建立並上傳全域 manifest.json
 */
export async function uploadManifestFile(cachedRevs: Record<string, string>): Promise<void> {
  const [ledgers, allAccounts, allContacts, allCategories, allBudgets, allBudgetRules, allTransactions] =
    await Promise.all([
      db.ledgers.toArray(),
      db.accounts.toArray(),
      db.contacts.toArray(),
      db.categories.toArray(),
      db.budgets.toArray(),
      db.budget_rules.toArray(),
      db.transactions.toArray(),
    ]);

  const activeLedgers = ledgers.filter((l) => !l.deleted);
  const deletedLedgerIds = ledgers.filter((l) => l.deleted).map((l) => l.id);

  const manifestLedgers: SyncManifestLedgerItem[] = activeLedgers.map((l) => ({
    id: l.id,
    name: l.name,
    baseCurrency: l.baseCurrency,
    isDefault: l.isDefault,
    stats: {
      accountsCount: allAccounts.filter((a) => a.ledgerId === l.id && !a.deleted).length,
      contactsCount: allContacts.filter((c) => c.ledgerId === l.id && !c.deleted).length,
      categoriesCount: allCategories.filter((c) => c.ledgerId === l.id && !c.deleted).length,
      budgetsCount: allBudgets.filter((b) => b.ledgerId === l.id && !b.deleted).length,
      budgetRulesCount: allBudgetRules.filter((r) => r.ledgerId === l.id && !r.deleted).length,
      transactionsCount: allTransactions.filter((t) => t.ledgerId === l.id && !t.deleted).length,
    },
  }));

  const e2eeConfig = getE2EEConfig();
  const now = new Date().toISOString();

  let e2eeManifest: SyncManifestE2EE | undefined;
  if (e2eeConfig && e2eeConfig.enabled && e2eeConfig.salt) {
    e2eeManifest = {
      enabled: true,
      updatedAt: e2eeConfig.updatedAt || e2eeConfig.createdAt || now,
      salt: e2eeConfig.salt,
      verification: e2eeConfig.verificationEnvelope,
    };
  } else {
    e2eeManifest = {
      enabled: false,
      updatedAt: e2eeConfig?.updatedAt || now,
    };
  }

  const manifest: SyncManifest = {
    appName: 'Zenance',
    schemaVersion: 2,
    exportedAt: now,
    totalLedgers: manifestLedgers.length,
    ledgers: manifestLedgers,
    deletedLedgerIds,
    e2ee: e2eeManifest,
  };

  const rev = await uploadJsonFile('/manifest.json', manifest);
  cachedRevs['/manifest.json'] = rev;
}

/**
 * 執行解包文件夾雙向同步 (Unpacked Folder Sync Engine)
 */
export async function executeSync(
  mode: 'auto' | 'overwrite_local' | 'overwrite_remote' = 'auto'
): Promise<SyncResult> {
  if (isSyncInProgress) {
    hasPendingSyncRequest = true;
    if (mode === 'overwrite_remote' || mode === 'overwrite_local') {
      pendingSyncMode = mode;
    }
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Sync already in progress, queued next run',
      actionTaken: 'up_to_date',
    };
  }

  if (!isDropboxConnected()) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Dropbox not connected',
      actionTaken: 'up_to_date',
    };
  }

  // 優先嘗試從本地安全金庫靜默恢復金鑰，避免重整後自動同步被誤判為已鎖定
  if (isE2EEEnabled() && !isE2EEUnlocked()) {
    await initE2EEKey();
  }

  updateSyncEngineStatus({ isSyncing: true, lastSyncError: null, justSynced: false });

  // 1. 純覆蓋雲端模式 (Overwrite Remote，例如停用 E2EE 覆寫明文或全量推送)
  if (mode === 'overwrite_remote') {
    if (isE2EEEnabled() && !isE2EEUnlocked()) {
      triggerSyncUnlockNeeded(mode);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'E2EE_LOCKED',
        needsUnlock: true,
        actionTaken: 'up_to_date',
      };
    }

    isSyncInProgress = true;
    try {
      const now = new Date().toISOString();
      const cachedRevs = getCachedRevs();
      const pushedTimes = getPushedTimes();

      await uploadAllLocalLedgers(now, cachedRevs, pushedTimes);
      await uploadManifestFile(cachedRevs);

      setCachedRevs(cachedRevs);
      setPushedTimes(pushedTimes);
      setLastSyncTime(now);

      if (justSyncedTimer) clearTimeout(justSyncedTimer);
      updateSyncEngineStatus({
        isSyncing: false,
        lastSyncTime: now,
        lastSyncError: null,
        justSynced: true,
      });
      justSyncedTimer = setTimeout(() => {
        updateSyncEngineStatus({ justSynced: false });
      }, 2500);

      return { success: true, timestamp: now, actionTaken: 'uploaded_local' };
    } catch (error: any) {
      console.error('Overwrite remote error:', error);
      updateSyncEngineStatus({
        isSyncing: false,
        lastSyncError: error?.message || 'Overwrite remote error',
        justSynced: false,
      });
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: error?.message || 'Overwrite remote error',
        actionTaken: 'up_to_date',
      };
    } finally {
      isSyncInProgress = false;
      if (hasPendingSyncRequest) {
        hasPendingSyncRequest = false;
        const nextMode = pendingSyncMode;
        pendingSyncMode = 'auto';
        setTimeout(() => {
          executeSync(nextMode).catch((err) => {
            console.warn('Pending sync execution error:', err);
          });
        }, 300);
      }
    }
  }

  isSyncInProgress = true;

  try {
    const now = new Date().toISOString();
    const cachedRevs = getCachedRevs();
    const pushedTimes = getPushedTimes();

    // 呼叫一次 listRemoteFolder，單次請求掌握所有遠端檔案及其 rev
    const remoteFiles = await listRemoteFolder();
    const ledgerFiles = remoteFiles.filter((f) => f.path_lower.startsWith('/ledgers/'));

    // 2. 遠端完全沒有資料夾記錄（初次上傳）
    if (ledgerFiles.length === 0) {
      await uploadAllLocalLedgers(now, cachedRevs, pushedTimes);
      await uploadManifestFile(cachedRevs);
      setCachedRevs(cachedRevs);
      setPushedTimes(pushedTimes);
      setLastSyncTime(now);

      return { success: true, timestamp: now, actionTaken: 'uploaded_initial' };
    }

    // 3. 雙向 E2EE 狀態機握手 (Bi-directional E2EE State Reconciliation)
    let remoteManifest: SyncManifest | null = null;
    const manifestMeta = remoteFiles.find((f) => f.path_lower === '/manifest.json');
    if (manifestMeta) {
      remoteManifest = await downloadJsonFile<SyncManifest>('/manifest.json');
      const remoteE2EE = remoteManifest?.e2ee;
      const localModified = getE2EEUpdatedAt();

      if (remoteE2EE) {
        if (!remoteE2EE.enabled) {
          // 情況 A：遠端已停用 E2EE。若遠端關閉時間較新或本地還開著 E2EE，自動同步關閉本地 E2EE
          if (!localModified || remoteE2EE.updatedAt >= localModified || isE2EEEnabled()) {
            disableE2EE(remoteE2EE.updatedAt);
          }
        } else if (remoteE2EE.enabled && remoteE2EE.salt) {
          // 情況 B：遠端已啟用 E2EE。若本地未啟用或遠端時間戳較新，匯入遠端配置
          if (!localModified || remoteE2EE.updatedAt >= localModified || !isE2EEEnabled()) {
            importRemoteE2EEConfig(
              remoteE2EE.salt,
              remoteE2EE.verification,
              remoteE2EE.updatedAt
            );
          }
          if (!isE2EEUnlocked()) {
            await initE2EEKey();
          }
          if (!isE2EEUnlocked()) {
            triggerSyncUnlockNeeded(mode);
            return {
              success: false,
              timestamp: now,
              error: 'E2EE_LOCKED',
              needsUnlock: true,
              actionTaken: 'up_to_date',
            };
          }
        }
      } else {
        // 舊版或無 E2EE 宣告的明文備份
        if (isE2EEEnabled() && !isE2EEUnlocked()) {
          triggerSyncUnlockNeeded(mode);
          return {
            success: false,
            timestamp: now,
            error: 'E2EE_LOCKED',
            needsUnlock: true,
            actionTaken: 'up_to_date',
          };
        }
      }
    } else {
      // 遠端無 manifest，若本地已啟用且未解鎖則阻斷
      if (isE2EEEnabled() && !isE2EEUnlocked()) {
        triggerSyncUnlockNeeded(mode);
        return {
          success: false,
          timestamp: now,
          error: 'E2EE_LOCKED',
          needsUnlock: true,
          actionTaken: 'up_to_date',
        };
      }
    }

    // 3. 純覆蓋本機模式 (Overwrite Local)
    if (mode === 'overwrite_local') {
      const remoteFileMap = new Map<string, DropboxFileMetadata>(
        remoteFiles.map((f) => [f.path_lower, f])
      );

      // 找出遠端所有帳本 ID
      const remoteLedgerIds = new Set<string>();
      for (const f of ledgerFiles) {
        const parts = f.path_lower.split('/');
        if (parts.length > 2 && parts[2]) {
          remoteLedgerIds.add(parts[2]);
        }
      }

      const allLedgers: Ledger[] = [];
      const allAccounts: Wallet[] = [];
      const allContacts: Contact[] = [];
      const allCategories: Category[] = [];
      const allBudgets: Budget[] = [];
      const allBudgetRules: BudgetRule[] = [];
      const allTransactions: Transaction[] = [];

      for (const ledgerId of remoteLedgerIds) {
        const prefix = `/ledgers/${ledgerId}`;
        const l = await downloadJsonFile<Ledger>(`${prefix}/ledger.json`);
        const accs = await downloadJsonFile<Wallet[]>(`${prefix}/accounts.json`);
        const conts = await downloadJsonFile<Contact[]>(`${prefix}/contacts.json`);
        const cats = await downloadJsonFile<Category[]>(`${prefix}/categories.json`);
        const buds = await downloadJsonFile<Budget[]>(`${prefix}/budgets.json`);
        const rules = await downloadJsonFile<BudgetRule[]>(`${prefix}/budget_rules.json`);

        // 交易分卷或舊單體下載
        const txBucketMetas = remoteFiles.filter(
          (f) =>
            f.path_lower.startsWith(`${prefix}/transactions/`) &&
            f.name.endsWith('.json') &&
            !f.name.endsWith('manifest.json')
        );

        let txs: Transaction[] = [];
        if (txBucketMetas.length > 0) {
          const downloadedChunks = await Promise.all(
            txBucketMetas.map((m) => downloadJsonFile<Transaction[]>(m.path_lower))
          );
          for (const chunk of downloadedChunks) {
            if (chunk?.length) txs.push(...chunk);
          }
        } else {
          // 向後相容舊單體
          const legacyTxs = await downloadJsonFile<Transaction[]>(`${prefix}/transactions.json`);
          if (legacyTxs?.length) txs = legacyTxs;
        }

        if (l) allLedgers.push(l);
        if (accs?.length) allAccounts.push(...accs);
        if (conts?.length) allContacts.push(...conts);
        if (cats?.length) allCategories.push(...cats);
        if (buds?.length) allBudgets.push(...buds);
        if (rules?.length) allBudgetRules.push(...rules);
        if (txs.length) allTransactions.push(...txs);
      }

      await db.transaction(
        'rw',
        [db.ledgers, db.transactions, db.categories, db.accounts, db.contacts, db.budgets, db.budget_rules],
        async () => {
          await Promise.all([
            db.ledgers.clear(),
            db.transactions.clear(),
            db.categories.clear(),
            db.accounts.clear(),
            db.contacts.clear(),
            db.budgets.clear(),
            db.budget_rules.clear(),
          ]);

          if (allLedgers.length) await db.ledgers.bulkPut(allLedgers);
          if (allAccounts.length) await db.accounts.bulkPut(allAccounts);
          if (allContacts.length) await db.contacts.bulkPut(allContacts);
          if (allCategories.length) await db.categories.bulkPut(allCategories);
          if (allBudgets.length) await db.budgets.bulkPut(allBudgets);
          if (allBudgetRules.length) await db.budget_rules.bulkPut(allBudgetRules);
          if (allTransactions.length) await db.transactions.bulkPut(allTransactions);
        }
      );

      // 快取所有遠端最新 rev
      for (const [pathLower, fileMeta] of remoteFileMap) {
        cachedRevs[pathLower] = fileMeta.rev;
      }
      setCachedRevs(cachedRevs);
      setLastSyncTime(now);

      // 全量拉取後，為所有帳本非同步校準月度資產快照
      for (const l of allLedgers) {
        reconcileMonthlySnapshotsForLedger(l.id);
      }

      return { success: true, timestamp: now, actionTaken: 'downloaded_remote' };
    }

    // 4. 動態雙向解包文件夾同步模式 (Auto Granular Selective Pull & Push)
    let hasLocalModified = false;
    let hasRemoteModified = false;
    const affectedLedgersForSnapshots = new Set<string>();

    // A. 遠端修訂號比對拉取 (Selective Pull via rev)
    const remoteFileMap = new Map<string, DropboxFileMetadata>(
      remoteFiles.map((f) => [f.path_lower, f])
    );

    // 找出所有遠端帳本 ID
    const remoteLedgerIds = new Set<string>();
    for (const f of ledgerFiles) {
      const parts = f.path_lower.split('/');
      if (parts.length > 2 && parts[2]) {
        remoteLedgerIds.add(parts[2]);
      }
    }

    // 同步遠端 deletedLedgerIds 至本地，確保多設備刪除狀態即時對齊
    if (remoteManifest?.deletedLedgerIds?.length) {
      for (const dId of remoteManifest.deletedLedgerIds) {
        const localL = await db.ledgers.get(dId);
        if (localL && !localL.deleted) {
          await db.ledgers.update(dId, { deleted: true, updatedAt: now });
          hasLocalModified = true;
        }
      }
    }

    // 檢視各遠端檔案是否需要下載 (僅在 rev 不一致時下載)
    // 優先依據拓撲依賴順序：先建立/更新 ledger 頂層帳本實體，再裝填子實體，徹底杜絕孤兒數據
    for (const ledgerId of remoteLedgerIds) {
      // 若該帳本在本地已標記為刪除或在遠端已刪除清單中，主動抹除雲端殘留資料夾，保持目錄清爽
      const localLed = await db.ledgers.get(ledgerId);
      if (localLed?.deleted || remoteManifest?.deletedLedgerIds?.includes(ledgerId)) {
        await deleteRemotePath(`/ledgers/${ledgerId}`).catch(() => {});
        continue;
      }

      const prefix = `/ledgers/${ledgerId}`;

      // 1. 優先檢查並更新 ledger.json
      const ledPath = `${prefix}/ledger.json`;
      const ledMeta = remoteFileMap.get(ledPath);
      if (ledMeta && cachedRevs[ledPath] !== ledMeta.rev) {
        const remoteLed = await downloadJsonFile<Ledger>(ledPath);
        const localLed = await db.ledgers.get(ledgerId);
        if (remoteLed && (!localLed || (remoteLed.updatedAt || '') > (localLed.updatedAt || ''))) {
          await db.ledgers.put(remoteLed);
          hasLocalModified = true;
        }
        cachedRevs[ledPath] = ledMeta.rev;
      }

      // 2. 檢查 accounts.json
      const accPath = `${prefix}/accounts.json`;
      const accMeta = remoteFileMap.get(accPath);
      if (accMeta && cachedRevs[accPath] !== accMeta.rev) {
        const remoteAccs = (await downloadJsonFile<Wallet[]>(accPath)) || [];
        const localAccs = await db.accounts.where('ledgerId').equals(ledgerId).toArray();
        const m = mergeEntities(localAccs, remoteAccs);
        if (m.hasLocalChanges) {
          await db.accounts.bulkPut(m.merged);
          hasLocalModified = true;
        }
        if (m.hasRemoteChanges) {
          hasRemoteModified = true;
        }
        cachedRevs[accPath] = accMeta.rev;
      }

      // 3. 檢查 contacts.json
      const contPath = `${prefix}/contacts.json`;
      const contMeta = remoteFileMap.get(contPath);
      if (contMeta && cachedRevs[contPath] !== contMeta.rev) {
        const remoteConts = (await downloadJsonFile<Contact[]>(contPath)) || [];
        const localConts = await db.contacts.where('ledgerId').equals(ledgerId).toArray();
        const m = mergeEntities(localConts, remoteConts);
        if (m.hasLocalChanges) {
          await db.contacts.bulkPut(m.merged);
          hasLocalModified = true;
        }
        if (m.hasRemoteChanges) {
          hasRemoteModified = true;
        }
        cachedRevs[contPath] = contMeta.rev;
      }

      // 4. 檢查 categories.json
      const catPath = `${prefix}/categories.json`;
      const catMeta = remoteFileMap.get(catPath);
      if (catMeta && cachedRevs[catPath] !== catMeta.rev) {
        const remoteCats = (await downloadJsonFile<Category[]>(catPath)) || [];
        const localCats = await db.categories.where('ledgerId').equals(ledgerId).toArray();
        const m = mergeEntities(localCats, remoteCats);
        if (m.hasLocalChanges) {
          await db.categories.bulkPut(m.merged);
          hasLocalModified = true;
        }
        if (m.hasRemoteChanges) {
          hasRemoteModified = true;
        }
        cachedRevs[catPath] = catMeta.rev;
      }

      // 5. 檢查 budgets.json
      const budPath = `${prefix}/budgets.json`;
      const budMeta = remoteFileMap.get(budPath);
      if (budMeta && cachedRevs[budPath] !== budMeta.rev) {
        const remoteBuds = (await downloadJsonFile<Budget[]>(budPath)) || [];
        const localBuds = await db.budgets.where('ledgerId').equals(ledgerId).toArray();
        const m = mergeEntities(localBuds, remoteBuds);
        if (m.hasLocalChanges) {
          await db.budgets.bulkPut(m.merged);
          hasLocalModified = true;
        }
        if (m.hasRemoteChanges) {
          hasRemoteModified = true;
        }
        cachedRevs[budPath] = budMeta.rev;
      }

      // 6. 檢查 budget_rules.json
      const rulePath = `${prefix}/budget_rules.json`;
      const ruleMeta = remoteFileMap.get(rulePath);
      if (ruleMeta && cachedRevs[rulePath] !== ruleMeta.rev) {
        const remoteRules = (await downloadJsonFile<BudgetRule[]>(rulePath)) || [];
        const localRules = await db.budget_rules.where('ledgerId').equals(ledgerId).toArray();
        const m = mergeEntities(localRules, remoteRules);
        if (m.hasLocalChanges) {
          await db.budget_rules.bulkPut(m.merged);
          hasLocalModified = true;
        }
        if (m.hasRemoteChanges) {
          hasRemoteModified = true;
        }
        cachedRevs[rulePath] = ruleMeta.rev;
      }

      // 7. 檢查交易分卷 (Transactions Buckets) 或向後相容舊單體
      const remoteTxBuckets = remoteFiles.filter(
        (f) =>
          f.path_lower.startsWith(`${prefix}/transactions/`) &&
          f.name.endsWith('.json') &&
          !f.name.endsWith('manifest.json')
      );
      const remoteTxManifestMeta = remoteFileMap.get(`${prefix}/transactions/manifest.json`);
      const legacyTxMeta = remoteFileMap.get(`${prefix}/transactions.json`);

      if (remoteTxBuckets.length > 0 || remoteTxManifestMeta) {
        // 新版分卷模式：遍歷有 rev 異動的月份桶
        for (const bucketMeta of remoteTxBuckets) {
          const bucketPath = bucketMeta.path_lower;
          if (cachedRevs[bucketPath] !== bucketMeta.rev) {
            const bucket = bucketMeta.name.replace('.json', '');
            const remoteBucketTxs = (await downloadJsonFile<Transaction[]>(bucketPath)) || [];

            // 查詢本地該帳本且屬於該月份（或 ID 在遠端列表中）的交易進行精準合併
            const remoteIds = new Set(remoteBucketTxs.map((t) => t.id));
            const allLocalTxs = await db.transactions.where('ledgerId').equals(ledgerId).toArray();
            const localBucketTxs = allLocalTxs.filter(
              (t) => getTransactionMonthBucket(t.date) === bucket || remoteIds.has(t.id)
            );

            const m = mergeEntities(localBucketTxs, remoteBucketTxs);
            if (m.hasLocalChanges) {
              await db.transactions.bulkPut(m.merged);
              hasLocalModified = true;
              affectedLedgersForSnapshots.add(ledgerId);
            }
            if (m.hasRemoteChanges) {
              hasRemoteModified = true;
            }
            cachedRevs[bucketPath] = bucketMeta.rev;
          }
        }

        if (remoteTxManifestMeta) {
          cachedRevs[`${prefix}/transactions/manifest.json`] = remoteTxManifestMeta.rev;
        }

        // 清理殘留舊單體
        if (legacyTxMeta) {
          await deleteRemotePath(`${prefix}/transactions.json`).catch(() => {});
          delete cachedRevs[`${prefix}/transactions.json`];
        }
      } else if (legacyTxMeta) {
        // 舊單體模式：向後相容拉取並標記需要遷移轉換
        const txPath = `${prefix}/transactions.json`;
        if (cachedRevs[txPath] !== legacyTxMeta.rev) {
          const remoteTxs = (await downloadJsonFile<Transaction[]>(txPath)) || [];
          const localTxs = await db.transactions.where('ledgerId').equals(ledgerId).toArray();
          const m = mergeEntities(localTxs, remoteTxs);
          if (m.hasLocalChanges) {
            await db.transactions.bulkPut(m.merged);
            hasLocalModified = true;
            affectedLedgersForSnapshots.add(ledgerId);
          }
          if (m.hasRemoteChanges) {
            hasRemoteModified = true;
          }
          cachedRevs[txPath] = legacyTxMeta.rev;
        }
        // 標記在隨後的上行中進行遷移轉化
        hasRemoteModified = true;
      }
    }

    // 若有遠端交易被拉取合併，背景觸發受影響帳本的歷史月末資產快照補齊
    if (affectedLedgersForSnapshots.size > 0) {
      for (const lid of affectedLedgersForSnapshots) {
        reconcileMonthlySnapshotsForLedger(lid);
      }
    }

    // B. 本地增量推送 (Granular Partial Push - 99% 只上傳 transactions.json)
    const localLedgers = await db.ledgers.toArray();

    for (const l of localLedgers) {
      const prefix = `/ledgers/${l.id}`;

      // 1. 檢查 transactions：按月分卷桶化增量推送 (Dirty Buckets Only)
      const localTxs = await db.transactions.where('ledgerId').equals(l.id).toArray();
      const groupedTxs = groupTransactionsByMonth(localTxs);
      const localBucketNames = new Set(Object.keys(groupedTxs));

      // 檢查遠端現存的月份桶（若有孤兒月份則清理）
      const remoteTxBucketMetas = remoteFiles.filter(
        (f) =>
          f.path_lower.startsWith(`${prefix}/transactions/`) &&
          f.name.endsWith('.json') &&
          !f.name.endsWith('manifest.json')
      );

      let txsChanged = false;

      // 清理遠端孤兒月份桶 (本地已無該月任何交易)
      for (const rMeta of remoteTxBucketMetas) {
        const bName = rMeta.name.replace('.json', '');
        if (!localBucketNames.has(bName)) {
          await deleteRemotePath(rMeta.path_lower).catch(() => {});
          delete cachedRevs[rMeta.path_lower];
          delete pushedTimes[`${l.id}_tx_${bName}`];
          delete pushedTimes[`${l.id}_tx_${bName}_count`];
          txsChanged = true;
          hasRemoteModified = true;
        }
      }

      // 檢查每個本地月份桶
      const bucketManifestData: Record<string, TransactionsBucketInfo> = {};

      for (const [bucket, bucketTxs] of Object.entries(groupedTxs)) {
        const bucketPath = `${prefix}/transactions/${bucket}.json`;
        const lastBucketPushed = pushedTimes[`${l.id}_tx_${bucket}`] || '';
        const lastBucketCount = pushedTimes[`${l.id}_tx_${bucket}_count`];
        const maxBucketUpdated = bucketTxs.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), '');

        const isCountChanged = lastBucketCount !== undefined && lastBucketCount !== String(bucketTxs.length);
        const isTimeUpdated = !lastBucketPushed || maxBucketUpdated > lastBucketPushed;
        const isMissingOnRemote = !cachedRevs[bucketPath];

        if (isTimeUpdated || isCountChanged || isMissingOnRemote || hasRemoteModified) {
          cachedRevs[bucketPath] = await uploadJsonFile(bucketPath, bucketTxs, cachedRevs[bucketPath]);
          pushedTimes[`${l.id}_tx_${bucket}`] = now;
          pushedTimes[`${l.id}_tx_${bucket}_count`] = String(bucketTxs.length);
          txsChanged = true;
          hasRemoteModified = true;
        }

        bucketManifestData[bucket] = {
          count: bucketTxs.filter((t) => !t.deleted).length,
          totalCount: bucketTxs.length,
          updatedAt: maxBucketUpdated,
        };
      }

      // 若該帳本交易有任何異動或缺少 manifest.json，更新 manifest.json 並清除舊單體
      const txManifestPath = `${prefix}/transactions/manifest.json`;
      if (txsChanged || !cachedRevs[txManifestPath]) {
        const bucketManifest: TransactionsBucketManifest = {
          version: 1,
          updatedAt: now,
          buckets: bucketManifestData,
        };
        cachedRevs[txManifestPath] = await uploadJsonFile(
          txManifestPath,
          bucketManifest,
          cachedRevs[txManifestPath]
        );

        // 清除遠端舊單體
        await deleteRemotePath(`${prefix}/transactions.json`).catch(() => {});
        delete cachedRevs[`${prefix}/transactions.json`];
        delete pushedTimes[`${l.id}_transactions`];
      }

      // 2. 檢查 accounts (錢包)
      const localAccs = await db.accounts.where('ledgerId').equals(l.id).toArray();
      const lastAccPushed = pushedTimes[`${l.id}_accounts`] || '';
      const maxAccUpdated = localAccs.reduce((max, a) => (a.updatedAt > max ? a.updatedAt : max), '');

      if (!lastAccPushed || maxAccUpdated > lastAccPushed) {
        const accPath = `${prefix}/accounts.json`;
        cachedRevs[accPath] = await uploadJsonFile(accPath, localAccs, cachedRevs[accPath]);
        pushedTimes[`${l.id}_accounts`] = now;
        hasRemoteModified = true;
      }

      // 3. 檢查 contacts (聯絡人)
      const localConts = await db.contacts.where('ledgerId').equals(l.id).toArray();
      const lastContPushed = pushedTimes[`${l.id}_contacts`] || '';
      const maxContUpdated = localConts.reduce((max, c) => (c.updatedAt > max ? c.updatedAt : max), '');

      if (!lastContPushed || maxContUpdated > lastContPushed) {
        const contPath = `${prefix}/contacts.json`;
        cachedRevs[contPath] = await uploadJsonFile(contPath, localConts, cachedRevs[contPath]);
        pushedTimes[`${l.id}_contacts`] = now;
        hasRemoteModified = true;
      }

      // 4. 檢查 categories (分類)
      const localCats = await db.categories.where('ledgerId').equals(l.id).toArray();
      const lastCatPushed = pushedTimes[`${l.id}_categories`] || '';
      const maxCatUpdated = localCats.reduce((max, c) => (c.updatedAt > max ? c.updatedAt : max), '');

      if (!lastCatPushed || maxCatUpdated > lastCatPushed) {
        const catPath = `${prefix}/categories.json`;
        cachedRevs[catPath] = await uploadJsonFile(catPath, localCats, cachedRevs[catPath]);
        pushedTimes[`${l.id}_categories`] = now;
        hasRemoteModified = true;
      }

      // 5. 檢查 budgets & rules
      const localBuds = await db.budgets.where('ledgerId').equals(l.id).toArray();
      const lastBudPushed = pushedTimes[`${l.id}_budgets`] || '';
      const maxBudUpdated = localBuds.reduce((max, b) => (b.updatedAt > max ? b.updatedAt : max), '');

      if (!lastBudPushed || maxBudUpdated > lastBudPushed) {
        const budPath = `${prefix}/budgets.json`;
        cachedRevs[budPath] = await uploadJsonFile(budPath, localBuds, cachedRevs[budPath]);
        pushedTimes[`${l.id}_budgets`] = now;
        hasRemoteModified = true;
      }

      const localRules = await db.budget_rules.where('ledgerId').equals(l.id).toArray();
      const lastRulePushed = pushedTimes[`${l.id}_budget_rules`] || '';
      const maxRuleUpdated = localRules.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), '');

      if (!lastRulePushed || maxRuleUpdated > lastRulePushed) {
        const rulePath = `${prefix}/budget_rules.json`;
        cachedRevs[rulePath] = await uploadJsonFile(rulePath, localRules, cachedRevs[rulePath]);
        pushedTimes[`${l.id}_budget_rules`] = now;
        hasRemoteModified = true;
      }

      // 6. 檢查 ledger.json
      const lastLedPushed = pushedTimes[`${l.id}_ledger`] || '';
      if (!lastLedPushed || (l.updatedAt || '') > lastLedPushed) {
        const ledPath = `${prefix}/ledger.json`;
        cachedRevs[ledPath] = await uploadJsonFile(ledPath, l, cachedRevs[ledPath]);
        pushedTimes[`${l.id}_ledger`] = now;
        hasRemoteModified = true;
      }
    }

    // 若有任何遠端推送變動，更新 manifest.json
    if (hasRemoteModified) {
      await uploadManifestFile(cachedRevs);
    }

    setCachedRevs(cachedRevs);
    setPushedTimes(pushedTimes);
    setLastSyncTime(now);

    if (justSyncedTimer) clearTimeout(justSyncedTimer);
    updateSyncEngineStatus({
      isSyncing: false,
      lastSyncTime: now,
      lastSyncError: null,
      justSynced: true,
    });
    justSyncedTimer = setTimeout(() => {
      updateSyncEngineStatus({ justSynced: false });
    }, 2500);

    return {
      success: true,
      timestamp: now,
      actionTaken: hasLocalModified || hasRemoteModified ? 'merged' : 'up_to_date',
    };
  } catch (error: any) {
    console.error('Folder sync execution error:', error);
    if (error?.message?.includes('DROPBOX_CONFLICT')) {
      console.warn('Dropbox concurrency conflict detected! Queuing automatic re-merge...');
      hasPendingSyncRequest = true;
      pendingSyncMode = 'auto';
    }
    const isLocked =
      error?.message === 'E2EE_LOCKED' || error?.message === 'E2EE_DECRYPT_FAILED';
    if (isLocked) {
      triggerSyncUnlockNeeded(mode);
    }
    updateSyncEngineStatus({
      isSyncing: false,
      lastSyncError: isLocked ? null : (error?.message || 'Unknown sync error'),
      justSynced: false,
    });
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error?.message || 'Unknown sync error',
      needsUnlock: isLocked,
      actionTaken: 'up_to_date',
    };
  } finally {
    isSyncInProgress = false;
    if (hasPendingSyncRequest) {
      hasPendingSyncRequest = false;
      const nextMode = pendingSyncMode;
      pendingSyncMode = 'auto';
      // 加入 300ms ~ 600ms 的隨機抖動退避 (Jitter)，防止多設備並行衝突時陷入週期性互鎖
      const jitterDelay = Math.floor(300 + Math.random() * 300);
      setTimeout(() => {
        executeSync(nextMode).catch((err) => {
          console.warn('Pending sync execution error:', err);
        });
      }, jitterDelay);
    }
  }
}

/**
 * 安排防抖自動同步 (本地記帳/異動後 3 秒自動執行局部增量推送)
 */
export function scheduleAutoSync(delayMs = 3000): void {
  if (!isDropboxConnected() || !navigator.onLine) return;

  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
  }

  autoSyncTimeout = setTimeout(() => {
    executeSync('auto')
      .then((res) => {
        if (res.needsUnlock) {
          triggerSyncUnlockNeeded('auto');
        }
      })
      .catch((err) => {
        console.warn('Auto folder sync error:', err);
      });
  }, delayMs);
}
