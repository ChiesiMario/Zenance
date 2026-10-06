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
  deleteRemotePath,
  type DropboxFileMetadata,
} from './dropboxClient';
import {
  commitStagingTokens,
  clearStagingTokens,
  setStagingTokens,
  exchangeCodeForTokensOnly,
  type DropboxTokens,
} from './dropboxAuth';
import {
  mergeEntities,
  uploadAllLocalLedgers,
  uploadManifestFile,
  setLastSyncTime,
  setCachedRevs,
  getCachedRevs,
  getPushedTimes,
  setPushedTimes,
  reconcileMonthlySnapshotsForLedger,
  type SyncManifest,
} from './syncEngine';
import {
  base64ToBuffer,
  deriveKeyFromPassphrase,
  decryptPayload,
} from '../crypto/webCrypto';
import { saveActiveKeyToVault } from '../crypto/keyVault';
import {
  getE2EEConfig,
  isE2EEUnlocked,
  E2EE_VERIFICATION_MAGIC,
  importRemoteE2EEConfig,
  setupE2EEInMemoryKey,
} from '../crypto/e2eeManager';

export type InitialSyncStep =
  | 'AUTH'          // 步驟 1: 換取 Token (暫存)
  | 'E2EE'          // 步驟 2: 檢查 / 輸入 E2EE 密碼
  | 'STRATEGY'      // 步驟 3: 衝突策略選擇 (雙方均有資料)
  | 'DOWNLOADING'   // 步驟 4: 下載與解密暫存至記憶體
  | 'APPLYING'      // 步驟 5: 本地原子事務寫入
  | 'COMPLETED';    // 步驟 6: 完成展示

export type SyncConflictStrategy = 'merge' | 'overwrite_local' | 'overwrite_remote';

export interface InitialSyncState {
  isOpen: boolean;
  step: InitialSyncStep;
  progressText: string;
  progressPercent: number;
  downloadedFilesCount: number;
  totalFilesCount: number;
  localCount: number;
  remoteCount: number;
  error?: string;
  isVerifyingPassphrase: boolean;
  isApplying: boolean;
  summary?: {
    ledgersCount: number;
    transactionsCount: number;
  };
}

interface StagedData {
  ledgers: Ledger[];
  accounts: Wallet[];
  contacts: Contact[];
  categories: Category[];
  budgets: Budget[];
  budgetRules: BudgetRule[];
  transactions: Transaction[];
  revs: Record<string, string>;
}

interface InitialSyncStaging {
  tokens: DropboxTokens | null;
  remoteManifest: SyncManifest | null;
  remoteFiles: DropboxFileMetadata[];
  derivedKey: CryptoKey | null;
  derivedSalt: Uint8Array | null;
  strategy: SyncConflictStrategy | null;
  downloaded: StagedData;
}

let staging: InitialSyncStaging = {
  tokens: null,
  remoteManifest: null,
  remoteFiles: [],
  derivedKey: null,
  derivedSalt: null,
  strategy: null,
  downloaded: {
    ledgers: [],
    accounts: [],
    contacts: [],
    categories: [],
    budgets: [],
    budgetRules: [],
    transactions: [],
    revs: {},
  },
};

let currentState: InitialSyncState = {
  isOpen: false,
  step: 'AUTH',
  progressText: '',
  progressPercent: 0,
  downloadedFilesCount: 0,
  totalFilesCount: 0,
  localCount: 0,
  remoteCount: 0,
  isVerifyingPassphrase: false,
  isApplying: false,
};

type StateListener = (state: InitialSyncState) => void;
const listeners = new Set<StateListener>();

function emitState(nextState: Partial<InitialSyncState>) {
  currentState = { ...currentState, ...nextState };
  listeners.forEach((listener) => listener(currentState));
}

export function subscribeInitialSyncState(listener: StateListener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

export function getInitialSyncState(): InitialSyncState {
  return currentState;
}

/**
 * 啟動首次同步流程
 */
export async function startInitialSync(code: string): Promise<void> {
  // 重設狀態與暫存
  staging = {
    tokens: null,
    remoteManifest: null,
    remoteFiles: [],
    derivedKey: null,
    derivedSalt: null,
    strategy: null,
    downloaded: {
      ledgers: [],
      accounts: [],
      contacts: [],
      categories: [],
      budgets: [],
      budgetRules: [],
      transactions: [],
      revs: {},
    },
  };

  emitState({
    isOpen: true,
    step: 'AUTH',
    progressText: '',
    progressPercent: 10,
    downloadedFilesCount: 0,
    totalFilesCount: 0,
    localCount: 0,
    remoteCount: 0,
    error: undefined,
    isVerifyingPassphrase: false,
    isApplying: false,
    summary: undefined,
  });

  try {
    // 步驟 1: 僅換取 Token 憑證，絕不持久化至 localStorage
    const tokens = await exchangeCodeForTokensOnly(code);
    staging.tokens = tokens;
    setStagingTokens(tokens);

    emitState({ progressPercent: 25 });

    // 步驟 2: 檢查遠端 Manifest 與 E2EE 加密狀態
    await inspectRemoteAndE2EE();
  } catch (err: any) {
    console.error('Initial sync auth failed:', err);
    emitState({
      error: err?.message || 'Authentication failed',
      progressPercent: 0,
    });
  }
}

/**
 * 檢查遠端檔案清單、Manifest 以及 E2EE 狀態
 */
async function inspectRemoteAndE2EE(): Promise<void> {
  try {
    // 取得本機未刪除交易總數
    const localCount = await db.transactions.filter((t) => !t.deleted).count();

    // 列出遠端檔案
    const remoteFiles = await listRemoteFolder();
    staging.remoteFiles = remoteFiles;

    // 檢查是否有 /manifest.json
    const manifestMeta = remoteFiles.find((f) => f.path_lower === '/manifest.json');
    let remoteManifest: SyncManifest | null = null;
    let remoteCount = 0;

    if (manifestMeta) {
      remoteManifest = await downloadJsonFile<SyncManifest>('/manifest.json');
      staging.remoteManifest = remoteManifest;
      remoteCount =
        remoteManifest?.ledgers?.reduce(
          (sum, l) => sum + (l.stats?.transactionsCount || 0),
          0
        ) || 0;
    }

    emitState({
      localCount,
      remoteCount,
      progressPercent: 35,
    });

    // 檢查 E2EE
    if (remoteManifest?.e2ee?.enabled && remoteManifest.e2ee.salt) {
      const currentConfig = getE2EEConfig();
      // 若本機已解鎖且 Salt 吻合，直接沿用
      if (isE2EEUnlocked() && currentConfig?.salt === remoteManifest.e2ee.salt) {
        await determineStrategy();
        return;
      }

      // 需要使用者輸入 E2EE 密碼解鎖
      emitState({
        step: 'E2EE',
        progressPercent: 40,
        error: undefined,
      });
      return;
    }

    // 遠端無 E2EE，直接推進至策略判定
    await determineStrategy();
  } catch (err: any) {
    console.error('Inspect remote failed:', err);
    emitState({
      error: err?.message || 'Failed to inspect remote data',
    });
  }
}

/**
 * 用戶提交 E2EE 密碼並進行校驗
 */
export async function submitE2EEPassphrase(passphrase: string): Promise<boolean> {
  const manifest = staging.remoteManifest;
  if (!manifest?.e2ee?.salt) {
    await determineStrategy();
    return true;
  }

  emitState({ isVerifyingPassphrase: true, error: undefined });

  try {
    const saltBytes = base64ToBuffer(manifest.e2ee.salt);
    const key = await deriveKeyFromPassphrase(passphrase.trim(), saltBytes);

    // 校驗金鑰
    if (manifest.e2ee.verification) {
      try {
        const decrypted = await decryptPayload<string>(manifest.e2ee.verification, key);
        if (decrypted !== E2EE_VERIFICATION_MAGIC) {
          emitState({
            isVerifyingPassphrase: false,
            error: 'INVALID_PASSPHRASE',
          });
          return false;
        }
      } catch {
        emitState({
          isVerifyingPassphrase: false,
          error: 'INVALID_PASSPHRASE',
        });
        return false;
      }
    }

    // 驗證通過，暫存金鑰並設置運行時記憶體金鑰以供下載解密
    staging.derivedKey = key;
    staging.derivedSalt = saltBytes;
    setupE2EEInMemoryKey(key, saltBytes);

    emitState({
      isVerifyingPassphrase: false,
      error: undefined,
      progressPercent: 50,
    });

    await determineStrategy();
    return true;
  } catch (err: any) {
    console.error('Passphrase verification error:', err);
    emitState({
      isVerifyingPassphrase: false,
      error: 'INVALID_PASSPHRASE',
    });
    return false;
  }
}

/**
 * 判定資料衝突策略 (若一方為空則自動進入下載，兩方均有則展示選擇介面)
 */
async function determineStrategy(): Promise<void> {
  const { localCount, remoteCount } = currentState;

  if (localCount > 0 && remoteCount > 0) {
    // 兩端皆有歷史資料，進入用戶手動策略選擇
    emitState({
      step: 'STRATEGY',
      progressPercent: 50,
      error: undefined,
    });
    return;
  }

  if (remoteCount === 0) {
    // 雲端無資料（初次備份上傳），自動覆蓋雲端
    await selectStrategy('overwrite_remote');
    return;
  }

  // 本地無資料（全新設備換機），自動覆蓋本地
  await selectStrategy('overwrite_local');
}

/**
 * 用戶或系統選擇同步策略並執行後續下載與寫入
 */
export async function selectStrategy(strategy: SyncConflictStrategy): Promise<void> {
  staging.strategy = strategy;

  if (strategy === 'overwrite_remote') {
    // 覆蓋雲端無需下載，直接進入原子寫入階段 (上傳本地資料)
    await executeAtomicCommit();
    return;
  }

  // 覆蓋本地或合併共存，需要先下載所有模組檔案至記憶體
  await executeDownloadQueue();
}

/**
 * 執行下載佇列：將遠端所有模組下載並解密至記憶體暫存
 */
async function executeDownloadQueue(): Promise<void> {
  emitState({
    step: 'DOWNLOADING',
    progressPercent: 55,
    downloadedFilesCount: 0,
    totalFilesCount: 0,
    error: undefined,
  });

  const remoteFiles = staging.remoteFiles;
  const deletedIds = new Set<string>(staging.remoteManifest?.deletedLedgerIds || []);
  const ledgerFiles = remoteFiles.filter((f) => {
    if (!f.path_lower.startsWith('/ledgers/')) return false;
    const parts = f.path_lower.split('/');
    const ledgerId = parts[2];
    return ledgerId && !deletedIds.has(ledgerId);
  });

  if (ledgerFiles.length === 0) {
    await executeAtomicCommit();
    return;
  }

  const filesToDownload = ledgerFiles.filter((f) => f.name.endsWith('.json'));
  const total = filesToDownload.length;
  let downloadedCount = 0;

  emitState({
    totalFilesCount: total,
    downloadedFilesCount: 0,
  });

  const staged = staging.downloaded;

  try {
    for (const file of filesToDownload) {
      const path = file.path_lower;
      const json = await downloadJsonFile<any>(path);

      if (json) {
        if (path.endsWith('/ledger.json')) {
          staged.ledgers.push(json as Ledger);
        } else if (path.endsWith('/accounts.json')) {
          staged.accounts.push(...(json as Wallet[]));
        } else if (path.endsWith('/contacts.json')) {
          staged.contacts.push(...(json as Contact[]));
        } else if (path.endsWith('/categories.json')) {
          staged.categories.push(...(json as Category[]));
        } else if (path.endsWith('/budgets.json')) {
          staged.budgets.push(...(json as Budget[]));
        } else if (path.endsWith('/budget_rules.json')) {
          staged.budgetRules.push(...(json as BudgetRule[]));
        } else if (path.includes('/transactions/') && path.endsWith('.json')) {
          if (!path.endsWith('/manifest.json') && Array.isArray(json)) {
            staged.transactions.push(...(json as Transaction[]));
          }
        } else if (path.endsWith('/transactions.json')) {
          if (Array.isArray(json)) {
            staged.transactions.push(...(json as Transaction[]));
          }
        }
      }

      staged.revs[path] = file.rev;
      downloadedCount++;

      const percent = Math.min(85, 55 + Math.round((downloadedCount / total) * 30));
      emitState({
        downloadedFilesCount: downloadedCount,
        progressPercent: percent,
      });
    }

    // 全部檔案下載解密完成，推進至步驟 5
    await executeAtomicCommit();
  } catch (err: any) {
    console.error('Download queue error:', err);
    emitState({
      error: err?.message || 'Download error',
    });
  }
}

/**
 * 步驟 5: 執行原子級本地寫入並最終持久化 Token
 */
async function executeAtomicCommit(): Promise<void> {
  emitState({
    step: 'APPLYING',
    isApplying: true,
    progressPercent: 90,
    error: undefined,
  });

  const strategy = staging.strategy || 'merge';
  const staged = staging.downloaded;
  const now = new Date().toISOString();

  try {
    if (strategy === 'overwrite_remote') {
      // 覆蓋雲端：全量推送本地資料至雲端
      const cachedRevs = getCachedRevs();
      const pushedTimes = getPushedTimes();
      await uploadAllLocalLedgers(now, cachedRevs, pushedTimes);
      await uploadManifestFile(cachedRevs);
      setCachedRevs(cachedRevs);
      setPushedTimes(pushedTimes);
    } else {
      // 覆蓋本地 或 合併共存：在 Dexie 原子事務中更新 IndexedDB
      await db.transaction(
        'rw',
        [
          db.ledgers,
          db.accounts,
          db.categories,
          db.transactions,
          db.contacts,
          db.budgets,
          db.budget_rules,
        ],
        async () => {
          if (strategy === 'overwrite_local') {
            await db.ledgers.clear();
            await db.accounts.clear();
            await db.categories.clear();
            await db.transactions.clear();
            await db.contacts.clear();
            await db.budgets.clear();
            await db.budget_rules.clear();

            if (staged.ledgers.length) await db.ledgers.bulkPut(staged.ledgers);
            if (staged.accounts.length) await db.accounts.bulkPut(staged.accounts);
            if (staged.categories.length) await db.categories.bulkPut(staged.categories);
            if (staged.transactions.length) {
              const uniqueTxs = Array.from(new Map(staged.transactions.map((t) => [t.id, t])).values());
              await db.transactions.bulkPut(uniqueTxs);
            }
            if (staged.contacts.length) await db.contacts.bulkPut(staged.contacts);
            if (staged.budgets.length) await db.budgets.bulkPut(staged.budgets);
            if (staged.budgetRules.length) await db.budget_rules.bulkPut(staged.budgetRules);
          } else if (strategy === 'merge') {
            const [
              localLedgers,
              localAccounts,
              localCategories,
              localTxs,
              localContacts,
              localBudgets,
              localRules,
            ] = await Promise.all([
              db.ledgers.toArray(),
              db.accounts.toArray(),
              db.categories.toArray(),
              db.transactions.toArray(),
              db.contacts.toArray(),
              db.budgets.toArray(),
              db.budget_rules.toArray(),
            ]);

            const mL = mergeEntities(localLedgers, staged.ledgers);
            const mA = mergeEntities(localAccounts, staged.accounts);
            const mC = mergeEntities(localCategories, staged.categories);
            const mT = mergeEntities(localTxs, staged.transactions);
            const mCt = mergeEntities(localContacts, staged.contacts);
            const mB = mergeEntities(localBudgets, staged.budgets);
            const mR = mergeEntities(localRules, staged.budgetRules);

            await Promise.all([
              db.ledgers.bulkPut(mL.merged),
              db.accounts.bulkPut(mA.merged),
              db.categories.bulkPut(mC.merged),
              db.transactions.bulkPut(mT.merged),
              db.contacts.bulkPut(mCt.merged),
              db.budgets.bulkPut(mB.merged),
              db.budget_rules.bulkPut(mR.merged),
            ]);
          }
        }
      );

      // 保存最新版本快取與時間戳
      setCachedRevs({ ...getCachedRevs(), ...staged.revs });
      setLastSyncTime(now);

      // 為受影響帳本排程月份快照重算
      for (const l of staged.ledgers) {
        reconcileMonthlySnapshotsForLedger(l.id).catch(() => {});
      }
    }

    // 若驗證了遠端 E2EE，持久化金鑰與配置
    if (staging.remoteManifest?.e2ee?.enabled && staging.remoteManifest.e2ee.salt) {
      importRemoteE2EEConfig(
        staging.remoteManifest.e2ee.salt,
        staging.remoteManifest.e2ee.verification,
        staging.remoteManifest.e2ee.updatedAt
      );

      if (staging.derivedKey && staging.derivedSalt) {
        await saveActiveKeyToVault(staging.derivedKey, staging.derivedSalt);
      }
    }

    // ★★★ 終態保障：所有資料操作完成後，最後一步才持久化 Token ★★★
    commitStagingTokens();

    // 取得最終統計：僅統計活躍帳本數量
    const totalLedgers = await db.ledgers.filter((l) => !l.deleted).count();
    const totalTxs = await db.transactions.filter((t) => !t.deleted).count();

    // 終態保障：非同步清理雲端已刪除的歷史帳本資料夾，確保 Dropbox 目錄 1:1 乾淨
    const deletedLedgers = await db.ledgers.filter((l) => l.deleted).toArray();
    for (const d of deletedLedgers) {
      deleteRemotePath(`/ledgers/${d.id}`).catch(() => {});
    }
    uploadManifestFile(getCachedRevs()).catch(() => {});

    emitState({
      step: 'COMPLETED',
      isApplying: false,
      progressPercent: 100,
      summary: {
        ledgersCount: totalLedgers,
        transactionsCount: totalTxs,
      },
    });
  } catch (err: any) {
    console.error('Atomic commit failed:', err);
    emitState({
      isApplying: false,
      error: err?.message || 'Failed to apply data to database',
    });
  }
}

/**
 * 用戶取消同步
 */
export function cancelInitialSync(): void {
  // 1. 清空記憶體 Tokens 與 Session
  clearStagingTokens();

  // 2. 清空 Staging
  staging = {
    tokens: null,
    remoteManifest: null,
    remoteFiles: [],
    derivedKey: null,
    derivedSalt: null,
    strategy: null,
    downloaded: {
      ledgers: [],
      accounts: [],
      contacts: [],
      categories: [],
      budgets: [],
      budgetRules: [],
      transactions: [],
      revs: {},
    },
  };

  // 3. 關閉彈窗並復原初始狀態
  emitState({
    isOpen: false,
    step: 'AUTH',
    progressPercent: 0,
    isVerifyingPassphrase: false,
    isApplying: false,
    error: undefined,
  });
}

/**
 * 用戶點擊完成關閉彈窗
 */
export function closeInitialSyncModal(): void {
  emitState({
    isOpen: false,
  });
}
