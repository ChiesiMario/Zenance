import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Account } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useAccounts() {
  const { activeLedgerId } = useAppStore();

  const accounts = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Account[]);
      return db.accounts.filter(a => !a.deleted && !a.archived && a.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const { wallets, contacts } = useMemo(() => {
    if (!accounts) return { wallets: [], contacts: [] };
    return {
      wallets: accounts.filter(a => !a.type || a.type === 'wallet'),
      contacts: accounts.filter(a => a.type === 'contact')
    };
  }, [accounts]);

  const addAccount = async (name: string, type: 'wallet' | 'contact' = 'wallet', initialBalance: number = 0, currency?: string, group: string = 'cash'): Promise<Account | null> => {
    if (!activeLedgerId) return null;
    const isFirstAccount = await db.accounts.filter(a => !a.deleted && (!a.type || a.type === 'wallet') && a.ledgerId === activeLedgerId).count() === 0;
    
    const newAccount: Account = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type,
      group,
      isDefault: type === 'wallet' ? isFirstAccount : false,
      initialBalance,
      currency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.accounts.add(newAccount);
    return newAccount;
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    await db.accounts.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const archiveAccount = async (id: string) => {
    await db.accounts.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteAccount = async (id: string): Promise<{ success: boolean; reason?: string }> => {
    // Check if account has any transactions
    const txCount = await db.transactions
      .filter(t => !t.deleted && (t.accountId === id || t.toAccountId === id))
      .count();

    if (txCount > 0) {
      return { success: false, reason: 'has_transactions' };
    }

    await db.accounts.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
    
    return { success: true };
  };

  return {
    accounts,
    wallets,
    contacts,
    addAccount,
    updateAccount,
    archiveAccount,
    deleteAccount,
  };
}
