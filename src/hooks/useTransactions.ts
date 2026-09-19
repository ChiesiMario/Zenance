import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import { sortTransactionsDesc } from '@/lib/utils';

export function useTransactions() {
  const { activeLedgerId } = useAppStore();

  const transactions = useLiveQuery(
    async () => {
      if (!activeLedgerId) return [] as Transaction[];
      const list = await db.transactions
        .filter(t => !t.deleted && t.ledgerId === activeLedgerId)
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
    await db.transactions.add(newTransaction);
    return id;
  };

  const addChildTransaction = async (
    parentId: string,
    data: Omit<Transaction, 'id' | 'ledgerId' | 'parentId' | 'createdAt' | 'updatedAt' | 'deleted'> & { id?: string }
  ): Promise<string | undefined> => {
    return addTransaction({
      ...data,
      parentId,
    });
  };

  const updateTransaction = async (
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>>
  ) => {
    await db.transactions.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteTransaction = async (id: string) => {
    const tx = await db.transactions.get(id);
    const now = new Date().toISOString();

    await db.transactions.update(id, {
      deleted: true,
      updatedAt: now,
    });

    // 連帶軟刪除所有子交易
    const childTxs = await db.transactions
      .filter(t => !t.deleted && t.parentId === id)
      .toArray();

    for (const child of childTxs) {
      await db.transactions.update(child.id, {
        deleted: true,
        updatedAt: now,
      });
    }

    // 若被刪除的交易是報銷回款子交易，檢查並恢復父層支出的報銷狀態
    if (tx && tx.parentId && tx.type === 'income') {
      const parentTx = await db.transactions.get(tx.parentId);
      if (parentTx && parentTx.reimbursementContactId) {
        const remainingChildRefunds = await db.transactions
          .filter(t => !t.deleted && t.id !== id && t.parentId === tx.parentId && t.type === 'income')
          .toArray();
        const totalStillRefunded = remainingChildRefunds.reduce((sum, t) => sum + t.amount, 0);

        if (totalStillRefunded < parentTx.amount) {
          await db.transactions.update(parentTx.id, {
            reimbursementStatus: 'pending',
            reimbursementSettledAt: undefined,
            updatedAt: now,
          });
        }
      }
    }

    // 若被刪除的交易是抹零支出子交易，還原父層支出的扣減金額並恢復為 pending
    if (tx && tx.parentId && tx.isWriteOff && tx.type === 'expense') {
      const parentTx = await db.transactions.get(tx.parentId);
      if (parentTx) {
        const restoredAmount = Math.round((parentTx.amount + tx.amount) * 100) / 100;
        const restoredOriginalAmount = Math.round((parentTx.originalAmount + tx.originalAmount) * 100) / 100;
        await db.transactions.update(parentTx.id, {
          amount: restoredAmount,
          originalAmount: restoredOriginalAmount,
          reimbursementStatus: 'pending',
          reimbursementSettledAt: undefined,
          updatedAt: now,
        });
      }
    }

    // 若被刪除的交易是報銷回款收入（向後相容舊版關聯），將關聯的已報銷支出恢復為 pending
    if (tx && tx.type === 'income' && tx.reimbursementContactId) {
      const relatedExpenses = await db.transactions
        .filter(t => !t.deleted && t.reimbursementIncomeTxId === id)
        .toArray();

      for (const expense of relatedExpenses) {
        await db.transactions.update(expense.id, {
          reimbursementStatus: 'pending',
          reimbursementSettledAt: undefined,
          reimbursementIncomeTxId: undefined,
          updatedAt: now,
        });
      }
    }
  };

  return {
    transactions,
    addTransaction,
    addChildTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
