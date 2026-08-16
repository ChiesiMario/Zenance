import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction } from '../services/db/db';
import { v4 as uuidv4 } from 'uuid';

export function useTransactions() {
  const transactions = useLiveQuery(() => 
    db.transactions
      .filter(t => !t.deleted)
      .reverse()
      .sortBy('date')
  );

  const addTransaction = async (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) => {
    const now = new Date().toISOString();
    await db.transactions.add({
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
  };

  const deleteTransaction = async (id: string) => {
    const now = new Date().toISOString();
    await db.transactions.update(id, {
      deleted: true,
      updatedAt: now,
    });
  };

  return {
    transactions,
    addTransaction,
    deleteTransaction,
  };
}
