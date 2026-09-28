import { db, type BalanceSnapshot } from '@/services/db/db';
import { getTxAccountDelta } from '@/lib/currency';

/**
 * 取得當前真實月份的標籤字串 (例如 "2026-09")
 */
export function getCurrentPeriodKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 計算指定年月的最後一天日期字串 (例如 "2026-05-31")
 */
export function getMonthClosingDate(periodKey: string): string {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  // day 0 of next month is the last day of this month
  const lastDay = new Date(year, month, 0).getDate();
  return `${periodKey}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * 向前傳播修正受歷史補記/修改/刪除影響的所有月末快照 (Delta Forward Propagation)
 * @param walletId 受影響的錢包 ID
 * @param txDate 交易發生的日期 (YYYY-MM-DD)
 * @param deltaAmount 該交易對該錢包造成的餘額變動淨值 (正數為資產增加，負數為資產減少)
 */
export async function applyHistoricalDelta(
  walletId: string,
  txDate: string,
  deltaAmount: number
): Promise<void> {
  if (Math.abs(deltaAmount) < 0.0001) return;

  const txPeriodKey = txDate.slice(0, 7); // "YYYY-MM"
  const currentPeriod = getCurrentPeriodKey();

  // 若交易發生在當前未結算的進行中月份，不需要更新歷史快照
  if (txPeriodKey >= currentPeriod) return;

  // 檢索該錢包在該月份及之後的所有歷史快照
  const affectedSnapshots = await db.balance_snapshots
    .where('walletId')
    .equals(walletId)
    .filter((s) => s.periodKey >= txPeriodKey)
    .toArray();

  if (affectedSnapshots.length === 0) return;

  const now = new Date().toISOString();
  for (const snap of affectedSnapshots) {
    const newClosing = Math.round((snap.closingBalance + deltaAmount) * 100) / 100;
    await db.balance_snapshots.update(snap.id, {
      closingBalance: newClosing,
      updatedAt: now,
    });
  }
}

/**
 * 查詢特定帳本下所有錢包的「最新可用月度快照」字典
 * Map: walletId -> BalanceSnapshot
 */
export async function getLatestWalletSnapshots(
  ledgerId: string
): Promise<Map<string, BalanceSnapshot>> {
  const map = new Map<string, BalanceSnapshot>();
  const snapshots = await db.balance_snapshots
    .where('ledgerId')
    .equals(ledgerId)
    .toArray();

  for (const s of snapshots) {
    const existing = map.get(s.walletId);
    if (!existing || s.periodKey > existing.periodKey) {
      map.set(s.walletId, s);
    }
  }

  return map;
}

/**
 * 自動為已結算的歷史月份生成缺失的月度餘額快照 (Lazy Background Worker)
 * 只對嚴格早於當前月份的歷史月度生成快照，當前進行中的月份不生成。
 */
export async function generateDueMonthlySnapshots(
  ledgerId: string,
  getRate: (from: string, to: string) => number,
  baseCurrency: string = 'CNY'
): Promise<void> {
  if (!ledgerId) return;

  const currentPeriod = getCurrentPeriodKey();
  const [wallets, transactions] = await Promise.all([
    db.accounts
      .where('ledgerId')
      .equals(ledgerId)
      .filter((w) => !w.deleted)
      .toArray(),
    db.transactions
      .where('ledgerId')
      .equals(ledgerId)
      .filter((t) => !t.deleted)
      .toArray(),
  ]);

  if (wallets.length === 0 || transactions.length === 0) return;

  // 依照日期升序排列流水
  const sortedTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const earliestDate = sortedTxs[0].date;
  const earliestPeriod = earliestDate.slice(0, 7);

  // 收集自最早交易月份至上個月的所有歷史月度
  const monthsToEvaluate: string[] = [];
  let [currY, currM] = earliestPeriod.split('-').map(Number);
  const [targetY, targetM] = currentPeriod.split('-').map(Number);

  while (currY < targetY || (currY === targetY && currM < targetM)) {
    const periodKey = `${currY}-${String(currM).padStart(2, '0')}`;
    monthsToEvaluate.push(periodKey);
    currM++;
    if (currM > 12) {
      currM = 1;
      currY++;
    }
  }

  if (monthsToEvaluate.length === 0) return;

  // 取得已存在的快照集合
  const existingSnapshots = await db.balance_snapshots
    .where('ledgerId')
    .equals(ledgerId)
    .toArray();
  const existingSet = new Set(existingSnapshots.map((s) => s.id));

  const newSnapshots: BalanceSnapshot[] = [];
  const now = new Date().toISOString();

  // 逐月計算歷史月末收盤餘額
  for (const periodKey of monthsToEvaluate) {
    const closingDate = getMonthClosingDate(periodKey);

    for (const wallet of wallets) {
      const snapId = `${wallet.id}_${periodKey}`;
      if (existingSet.has(snapId)) continue;

      // 累計截至該月末的所有流水
      let balance = wallet.initialBalance || 0;
      let txCount = 0;

      for (const tx of sortedTxs) {
        if (tx.date > closingDate) break; // 已按日期排序，超過該月末則停止
        const delta = getTxAccountDelta(tx, wallet, getRate, baseCurrency);
        if (delta !== 0) {
          balance += delta;
          txCount++;
        }
      }

      newSnapshots.push({
        id: snapId,
        ledgerId,
        walletId: wallet.id,
        periodKey,
        closingBalance: Math.round(balance * 100) / 100,
        currency: wallet.currency || baseCurrency,
        snapshotDate: closingDate,
        transactionCount: txCount,
        updatedAt: now,
      });
    }
  }

  if (newSnapshots.length > 0) {
    await db.balance_snapshots.bulkPut(newSnapshots);
  }
}
