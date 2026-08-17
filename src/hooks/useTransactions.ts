import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';

export function useTransactions() {
  const { activeLedgerId } = useAppStore();

  const transactions = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Transaction[]);
      return db.transactions
        .filter(t => !t.deleted && t.ledgerId === activeLedgerId)
        .reverse()
        .sortBy('date');
    },
    [activeLedgerId]
  );

  const addTransaction = async (
    data: Omit<Transaction, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>
  ) => {
    if (!activeLedgerId) return;
    const id = uuidv4();
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
    await db.transactions.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
