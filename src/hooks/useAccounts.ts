import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Wallet, type Account } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import { useContacts } from '@/hooks/useContacts';

export function useAccounts() {
  const { activeLedgerId } = useAppStore();
  const {
    contacts,
    archivedContacts,
    allContacts,
    addContact,
    updateContact,
    archiveContact: archiveContactFn,
    unarchiveContact: unarchiveContactFn,
    deleteContact: deleteContactFn,
  } = useContacts();

  // 純淨實體錢包列表 (db.accounts 現只儲存錢包實體)
  const wallets = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Wallet[]);
      return db.accounts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(a => !a.deleted && !a.archived)
        .toArray();
    },
    [activeLedgerId]
  );

  const archivedWallets = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Wallet[]);
      return db.accounts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(a => !a.deleted && a.archived === true)
        .toArray();
    },
    [activeLedgerId]
  );

  // 向後相容別名
  const accounts = wallets;
  const archivedAccounts = archivedWallets;

  const addAccount = async (
    name: string,
    type: 'wallet' | 'contact' = 'wallet',
    initialBalance: number = 0,
    currency?: string,
    group: string = 'cash',
    extra?: Partial<Wallet & { note?: string }>
  ): Promise<Account | null> => {
    if (!activeLedgerId) return null;

    if (type === 'contact') {
      const contact = await addContact(name, group || 'personal', currency, extra?.note);
      return contact as unknown as Account;
    }

    const isFirstAccount =
      (await db.accounts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(a => !a.deleted)
        .count()) === 0;
    
    const newWallet: Wallet = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type: 'wallet',
      group,
      isDefault: isFirstAccount,
      initialBalance,
      currency,
      ...extra,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.accounts.add(newWallet);
    return newWallet;
  };

  const updateAccount = async (id: string, updates: Partial<Wallet>) => {
    // 檢查是否為聯絡人
    const isContact = (await db.contacts.get(id)) !== undefined;
    if (isContact) {
      await updateContact(id, updates as any);
      return;
    }

    await db.accounts.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const archiveAccount = async (id: string) => {
    const isContact = (await db.contacts.get(id)) !== undefined;
    if (isContact) {
      await archiveContactFn(id);
      return;
    }

    await db.accounts.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
  };

  const unarchiveAccount = async (id: string) => {
    const isContact = (await db.contacts.get(id)) !== undefined;
    if (isContact) {
      await unarchiveContactFn(id);
      return;
    }

    await db.accounts.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteAccount = async (id: string): Promise<{ success: boolean; reason?: string }> => {
    const isContact = (await db.contacts.get(id)) !== undefined;
    if (isContact) {
      return deleteContactFn(id);
    }

    // Check if account has any transactions via accountId and toAccountId indexes
    const [fromCount, toCount] = await Promise.all([
      db.transactions
        .where('accountId')
        .equals(id)
        .filter(t => !t.deleted)
        .count(),
      db.transactions
        .where('toAccountId')
        .equals(id)
        .filter(t => !t.deleted)
        .count(),
    ]);

    if (fromCount > 0 || toCount > 0) {
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
    archivedAccounts,
    wallets,
    archivedWallets,
    contacts,
    archivedContacts,
    allContacts,
    addAccount,
    updateAccount,
    archiveAccount,
    unarchiveAccount,
    deleteAccount,
  };
}
