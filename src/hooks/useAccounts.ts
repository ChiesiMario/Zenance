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
      return db.accounts.filter(a => !a.deleted && a.ledgerId === activeLedgerId).toArray();
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

  const addAccount = async (name: string, type: 'wallet' | 'contact' = 'wallet'): Promise<Account | null> => {
    if (!activeLedgerId) return null;
    const isFirstAccount = await db.accounts.filter(a => !a.deleted && (!a.type || a.type === 'wallet') && a.ledgerId === activeLedgerId).count() === 0;
    
    const newAccount: Account = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type,
      isDefault: type === 'wallet' ? isFirstAccount : false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.accounts.add(newAccount);
    return newAccount;
  };

  const deleteAccount = async (id: string) => {
    await db.accounts.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    accounts,
    wallets,
    contacts,
    addAccount,
    deleteAccount,
  };
}
