import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import { sortTransactionsDesc } from '@/lib/utils';
import { applyHistoricalDelta } from '@/services/balance/snapshotService';
import { getTxAccountDelta } from '@/lib/currency';
import { scheduleAutoSync } from '@/services/sync/syncEngine';

export function useTransactions() {
  const { activeLedgerId } = useAppStore();

  const transactions = useLiveQuery(
    async () => {
      if (!activeLedgerId) return [] as Transaction[];
      const list = await db.transactions
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(t => !t.deleted)
        .toArray();
      return sortTransactionsDesc(list);
    },
    [activeLedgerId]
  );

  const addTransaction = async (
    data: Omit<Transaction, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string }
  ): Promise<string | undefined> => {
    if (!activeLedgerId) return;
    const id = data.id || uuidv4();
    const newTransaction: Transaction = {
      ...data,
      id,
      displayId: id.split('-')[0].toUpperCase(),
      ledgerId: activeLedgerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };

    await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
      await db.transactions.add(newTransaction);

      // 若補記歷史月份交易，向前連鎖校正月末快照
      if (newTransaction.accountId) {
        const fromWallet = await db.accounts.get(newTransaction.accountId);
        if (fromWallet) {
          const delta = getTxAccountDelta(newTransaction, fromWallet, () => 1, fromWallet.currency || 'CNY');
          await applyHistoricalDelta(fromWallet.id, newTransaction.date, delta);
        }
      }
      if (newTransaction.toAccountId) {
        const toWallet = await db.accounts.get(newTransaction.toAccountId);
        if (toWallet) {
          const delta = getTxAccountDelta(newTransaction, toWallet, () => 1, toWallet.currency || 'CNY');
          await applyHistoricalDelta(toWallet.id, newTransaction.date, delta);
        }
      }
    });

    scheduleAutoSync(3000);
    return id;
  };

  const addTransactionsAtomic = async (
    items: Array<Omit<Transaction, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string }>
  ): Promise<string[]> => {
    if (!activeLedgerId || items.length === 0) return [];
    const result = await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
      const ids: string[] = [];
      const now = new Date().toISOString();
      const records: Transaction[] = items.map((data) => {
        const id = data.id || uuidv4();
        ids.push(id);
        return {
          ...data,
          id,
          displayId: id.split('-')[0].toUpperCase(),
          ledgerId: activeLedgerId,
          createdAt: now,
          updatedAt: now,
          deleted: false,
        };
      });
      await db.transactions.bulkAdd(records);

      for (const rec of records) {
        if (rec.accountId) {
          const fromWallet = await db.accounts.get(rec.accountId);
          if (fromWallet) {
            const delta = getTxAccountDelta(rec, fromWallet, () => 1, fromWallet.currency || 'CNY');
            await applyHistoricalDelta(fromWallet.id, rec.date, delta);
          }
        }
        if (rec.toAccountId) {
          const toWallet = await db.accounts.get(rec.toAccountId);
          if (toWallet) {
            const delta = getTxAccountDelta(rec, toWallet, () => 1, toWallet.currency || 'CNY');
            await applyHistoricalDelta(toWallet.id, rec.date, delta);
          }
        }
      }

      return ids;
    });

    scheduleAutoSync(3000);
    return result;
  };

  const updateTransaction = async (
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>>
  ) => {
    await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
      const oldTx = await db.transactions.get(id);
      if (!oldTx) return;

      const newTx: Transaction = {
        ...oldTx,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      await db.transactions.update(id, {
        ...data,
        updatedAt: newTx.updatedAt,
      });

      // 歷史差額校正
      if (oldTx.accountId) {
        const fromWallet = await db.accounts.get(oldTx.accountId);
        if (fromWallet) {
          const oldDelta = getTxAccountDelta(oldTx, fromWallet, () => 1, fromWallet.currency || 'CNY');
          await applyHistoricalDelta(fromWallet.id, oldTx.date, -oldDelta);
          const newDelta = getTxAccountDelta(newTx, fromWallet, () => 1, fromWallet.currency || 'CNY');
          await applyHistoricalDelta(fromWallet.id, newTx.date, newDelta);
        }
      }
      if (oldTx.toAccountId) {
        const toWallet = await db.accounts.get(oldTx.toAccountId);
        if (toWallet) {
          const oldDelta = getTxAccountDelta(oldTx, toWallet, () => 1, toWallet.currency || 'CNY');
          await applyHistoricalDelta(toWallet.id, oldTx.date, -oldDelta);
          const newDelta = getTxAccountDelta(newTx, toWallet, () => 1, toWallet.currency || 'CNY');
          await applyHistoricalDelta(toWallet.id, newTx.date, newDelta);
        }
      }
    });

    scheduleAutoSync(3000);
  };

  const deleteTransaction = async (id: string) => {
    await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
      const tx = await db.transactions.get(id);
      if (!tx || tx.deleted) return;

      await db.transactions.update(id, {
        deleted: true,
        updatedAt: new Date().toISOString(),
      });

      // 撤銷該筆歷史交易在快照中的影響
      if (tx.accountId) {
        const fromWallet = await db.accounts.get(tx.accountId);
        if (fromWallet) {
          const delta = getTxAccountDelta(tx, fromWallet, () => 1, fromWallet.currency || 'CNY');
          await applyHistoricalDelta(fromWallet.id, tx.date, -delta);
        }
      }
      if (tx.toAccountId) {
        const toWallet = await db.accounts.get(tx.toAccountId);
        if (toWallet) {
          const delta = getTxAccountDelta(tx, toWallet, () => 1, toWallet.currency || 'CNY');
          await applyHistoricalDelta(toWallet.id, tx.date, -delta);
        }
      }
    });

    scheduleAutoSync(3000);
  };

  return {
    transactions,
    addTransaction,
    addTransactionsAtomic,
    updateTransaction,
    deleteTransaction,
  };
}
