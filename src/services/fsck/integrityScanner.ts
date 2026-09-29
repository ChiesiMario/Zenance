import { db, type Wallet } from '@/services/db/db';
import { getTxAccountDelta } from '@/lib/currency';
import type { IntegrityReport, IntegrityIssue } from './integrityTypes';

const SYSTEM_CATEGORIES = new Set(['transfer', 'advance', 'loan']);

/**
 * 深度掃描資料庫一致性（純只讀 Dry-Run，不修改任何資料）
 */
export async function scanDatabaseIntegrity(targetLedgerId?: string): Promise<IntegrityReport> {
  const startTime = performance.now();
  const issues: IntegrityIssue[] = [];

  // 並發讀取所有實體表資料
  const [ledgers, allTransactions, allAccounts, allContacts, allCategories, allSnapshots] =
    await Promise.all([
      db.ledgers.toArray(),
      targetLedgerId
        ? db.transactions.where('ledgerId').equals(targetLedgerId).toArray()
        : db.transactions.toArray(),
      targetLedgerId
        ? db.accounts.where('ledgerId').equals(targetLedgerId).toArray()
        : db.accounts.toArray(),
      targetLedgerId
        ? db.contacts.where('ledgerId').equals(targetLedgerId).toArray()
        : db.contacts.toArray(),
      targetLedgerId
        ? db.categories.where('ledgerId').equals(targetLedgerId).toArray()
        : db.categories.toArray(),
      targetLedgerId
        ? db.balance_snapshots.where('ledgerId').equals(targetLedgerId).toArray()
        : db.balance_snapshots.toArray(),
    ]);

  const totalRecordsScanned =
    ledgers.length +
    allTransactions.length +
    allAccounts.length +
    allContacts.length +
    allCategories.length +
    allSnapshots.length;

  const validEntityIds = new Set<string>([
    ...allAccounts.map((a) => a.id),
    ...allContacts.map((c) => c.id),
  ]);

  const validCategoryIds = new Set<string>([
    ...allCategories.map((c) => c.id),
  ]);

  // 1. 檢測懸掛外鍵 (Dangling Wallet / Contact / Category) 與浮點精度
  const splitGroupCounts = new Map<string, number>();

  for (const tx of allTransactions) {
    if (tx.deleted) continue;

    // 檢測 出款/關聯帳戶 ID 是否懸空
    if (tx.accountId && !validEntityIds.has(tx.accountId)) {
      issues.push({
        id: `dangling_acc_${tx.id}_${tx.accountId}`,
        code: 'DANGLING_WALLET',
        severity: 'medium',
        table: 'transactions',
        recordId: tx.id,
        relatedId: tx.accountId,
        description: `交易 #${tx.displayId || tx.id.slice(0, 8)} 指向不存在的帳戶 ID (${tx.accountId})`,
        suggestedAction: `自動建立以該 ID 命名的實體帳戶，確保帳面金額安全歸位`,
        autoFixable: true,
        metadata: { ledgerId: tx.ledgerId, missingId: tx.accountId },
      });
    }

    // 檢測 入款/目標帳戶 ID 是否懸空
    if (tx.toAccountId && !validEntityIds.has(tx.toAccountId)) {
      issues.push({
        id: `dangling_toacc_${tx.id}_${tx.toAccountId}`,
        code: 'DANGLING_WALLET',
        severity: 'medium',
        table: 'transactions',
        recordId: tx.id,
        relatedId: tx.toAccountId,
        description: `交易 #${tx.displayId || tx.id.slice(0, 8)} 指向不存在的目標帳戶 ID (${tx.toAccountId})`,
        suggestedAction: `自動建立以該 ID 命名的實體帳戶，確保帳面金額安全歸位`,
        autoFixable: true,
        metadata: { ledgerId: tx.ledgerId, missingId: tx.toAccountId },
      });
    }

    // 檢測 分類 ID 是否懸空
    if (tx.category && !SYSTEM_CATEGORIES.has(tx.category) && !validCategoryIds.has(tx.category)) {
      issues.push({
        id: `dangling_cat_${tx.id}_${tx.category}`,
        code: 'DANGLING_CATEGORY',
        severity: 'low',
        table: 'transactions',
        recordId: tx.id,
        relatedId: tx.category,
        description: `交易 #${tx.displayId || tx.id.slice(0, 8)} 指向不存在的分類 ID (${tx.category})`,
        suggestedAction: `自動建立以該 ID 命名的分類實體，保留歷史分類記錄`,
        autoFixable: true,
        metadata: { ledgerId: tx.ledgerId, missingId: tx.category, txType: tx.type },
      });
    }

    // 檢測 浮點數精度漂移與無效數值
    const checkAmountDrift = (amt: number | undefined, fieldName: string) => {
      if (amt === undefined) return;
      if (isNaN(amt) || !isFinite(amt)) {
        issues.push({
          id: `invalid_num_${tx.id}_${fieldName}`,
          code: 'PRECISION_DRIFT',
          severity: 'high',
          table: 'transactions',
          recordId: tx.id,
          description: `交易 #${tx.displayId || tx.id.slice(0, 8)} 的 ${fieldName} 為無效數字 (NaN)`,
          suggestedAction: '安全重置數值為 0',
          autoFixable: true,
          metadata: { field: fieldName, cleanValue: 0 },
        });
      } else {
        const rounded = Math.round(amt * 100) / 100;
        if (Math.abs(amt - rounded) > 0.0001) {
          issues.push({
            id: `precision_${tx.id}_${fieldName}`,
            code: 'PRECISION_DRIFT',
            severity: 'low',
            table: 'transactions',
            recordId: tx.id,
            description: `交易 #${tx.displayId || tx.id.slice(0, 8)} 的 ${fieldName} 存在長小數點精度漂移 (${amt})`,
            suggestedAction: `精準四捨五入歸位至二位小數 (${rounded})`,
            autoFixable: true,
            metadata: { field: fieldName, cleanValue: rounded },
          });
        }
      }
    };

    checkAmountDrift(tx.amount, 'amount');
    checkAmountDrift(tx.originalAmount, 'originalAmount');
    checkAmountDrift(tx.transferInAmount, 'transferInAmount');

    // 統計 splitGroupId
    if (tx.splitGroupId) {
      splitGroupCounts.set(tx.splitGroupId, (splitGroupCounts.get(tx.splitGroupId) || 0) + 1);
    }
  }

  // 2. 檢測 孤島分攤群組 (Orphaned Split Groups)
  for (const [groupId, count] of splitGroupCounts.entries()) {
    if (count <= 1) {
      const orphanTx = allTransactions.find((t) => t.splitGroupId === groupId && !t.deleted);
      if (orphanTx) {
        issues.push({
          id: `orphan_split_${groupId}`,
          code: 'ORPHAN_SPLIT_GROUP',
          severity: 'low',
          table: 'transactions',
          recordId: orphanTx.id,
          description: `分攤群組 (${groupId.slice(0, 8)}) 僅剩 1 筆孤立交易`,
          suggestedAction: '解開該群組，將其恢復為獨立普通交易展示',
          autoFixable: true,
          metadata: { splitGroupId: groupId },
        });
      }
    }
  }

  // 3. 檢測 多預設衝突 (Multiple Defaults)
  const defaultLedgers = ledgers.filter((l) => l.isDefault && !l.deleted);
  if (defaultLedgers.length > 1) {
    issues.push({
      id: 'multi_default_ledgers',
      code: 'MULTIPLE_DEFAULTS',
      severity: 'medium',
      table: 'ledgers',
      recordId: defaultLedgers[0].id,
      description: `檢測到 ${defaultLedgers.length} 個帳本被同時標記為預設帳本`,
      suggestedAction: '依據最後修改時間仲裁，保留最新一筆為預設',
      autoFixable: true,
      metadata: { ids: defaultLedgers.map((l) => l.id) },
    });
  }

  const accountsByLedger = new Map<string, Wallet[]>();
  allAccounts.forEach((acc) => {
    if (acc.deleted) return;
    const list = accountsByLedger.get(acc.ledgerId) || [];
    list.push(acc);
    accountsByLedger.set(acc.ledgerId, list);
  });

  for (const [lId, accList] of accountsByLedger.entries()) {
    const defaultAccs = accList.filter((a) => a.isDefault);
    if (defaultAccs.length > 1) {
      issues.push({
        id: `multi_default_acc_${lId}`,
        code: 'MULTIPLE_DEFAULTS',
        severity: 'low',
        table: 'accounts',
        recordId: defaultAccs[0].id,
        description: `帳本 (${lId.slice(0, 8)}) 中存在 ${defaultAccs.length} 個預設錢包`,
        suggestedAction: '保留首個錢包為預設，其餘取消預設標記',
        autoFixable: true,
        metadata: { ids: defaultAccs.map((a) => a.id) },
      });
    }
  }

  // 4. 檢測 月度餘額快照檢查點對帳 (Snapshot Drift)
  const walletMap = new Map<string, Wallet>(allAccounts.map((w) => [w.id, w]));
  const sortedTxs = [...allTransactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const snap of allSnapshots) {
    const wallet = walletMap.get(snap.walletId);
    if (!wallet) continue;

    let expectedBalance = wallet.initialBalance || 0;
    for (const tx of sortedTxs) {
      if (tx.deleted || tx.ledgerId !== snap.ledgerId) continue;
      if (tx.date > snap.snapshotDate) break;
      expectedBalance += getTxAccountDelta(tx, wallet, () => 1, snap.currency);
    }

    expectedBalance = Math.round(expectedBalance * 100) / 100;
    if (Math.abs(expectedBalance - snap.closingBalance) >= 0.01) {
      issues.push({
        id: `drift_snap_${snap.id}`,
        code: 'SNAPSHOT_DRIFT',
        severity: 'medium',
        table: 'balance_snapshots',
        recordId: snap.id,
        description: `錢包 (${wallet.name}) 在 ${snap.periodKey} 的快照餘額 (${snap.closingBalance}) 與真實流水累計 (${expectedBalance}) 不符`,
        suggestedAction: `自動校準快照餘額為真實累計值 (${expectedBalance})`,
        autoFixable: true,
        metadata: { expected: expectedBalance, actual: snap.closingBalance },
      });
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  // 計算健康評分 (0 ~ 100)
  let score = 100;
  issues.forEach((iss) => {
    if (iss.severity === 'high') score -= 20;
    else if (iss.severity === 'medium') score -= 10;
    else score -= 4;
  });
  score = Math.max(0, Math.min(100, score));

  const status: 'healthy' | 'warning' | 'corrupted' =
    score === 100 ? 'healthy' : score >= 80 ? 'warning' : 'corrupted';

  return {
    status,
    score,
    checkedAt: new Date().toISOString(),
    durationMs,
    totalRecordsScanned,
    issues,
    fixedCount: 0,
  };
}
