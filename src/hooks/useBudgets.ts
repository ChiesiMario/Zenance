import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Budget } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useTransactions } from './useTransactions';
import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useBudgets() {
  const { activeLedgerId } = useAppStore();

  const budgets = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Budget[]);
      return db.budgets.filter(b => !b.deleted && b.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const { transactions } = useTransactions();

  // Calculate spent amount for each budget
  const budgetProgress = useMemo(() => {
    const progress: Record<string, number> = {};
    if (!budgets || !transactions) return progress;

    budgets.forEach(b => {
      let spent = 0;
      transactions.forEach(tx => {
        // Only count expenses within the date range
        if (tx.type === 'expense' && tx.date >= b.startDate && tx.date <= b.endDate) {
          spent += tx.amount;
        }
      });
      progress[b.id] = spent;
    });
    return progress;
  }, [budgets, transactions]);

  const addBudget = async (data: Omit<Budget, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>): Promise<Budget> => {
    if (!activeLedgerId) throw new Error('No active ledger');
    const newBudget: Budget = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.budgets.add(newBudget);
    return newBudget;
  };

  const updateBudget = async (
    id: string,
    data: Partial<Omit<Budget, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>>
  ) => {
    await db.budgets.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteBudget = async (id: string) => {
    await db.budgets.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  // Find the active budget (first budget where current date falls between start and end date)
  const activeBudget = useMemo(() => {
    if (!budgets) return null;
    const today = new Date().toISOString().split('T')[0];
    return budgets.find(b => b.startDate <= today && b.endDate >= today) || null;
  }, [budgets]);

  return {
    budgets,
    budgetProgress,
    activeBudget,
    addBudget,
    updateBudget,
    deleteBudget,
  };
}
