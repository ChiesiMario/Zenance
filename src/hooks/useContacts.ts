import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Contact } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';

// 模組級單例記憶體快取：紀錄各帳本最新一次成功 Resolve 的聯絡人列表，消除詳情頁首次掛載的 0 態空隙
const lastContactsCache: Record<string, Contact[]> = {};
const lastArchivedContactsCache: Record<string, Contact[]> = {};
const lastAllContactsCache: Record<string, Contact[]> = {};

export function useContacts() {
  const { activeLedgerId } = useAppStore();

  const contacts = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Contact[]);
      return db.contacts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted && !c.archived)
        .toArray();
    },
    [activeLedgerId]
  );

  const archivedContacts = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Contact[]);
      return db.contacts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted && c.archived === true)
        .toArray();
    },
    [activeLedgerId]
  );

  const allContacts = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Contact[]);
      return db.contacts
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted)
        .toArray();
    },
    [activeLedgerId]
  );

  if (activeLedgerId) {
    if (contacts !== undefined) lastContactsCache[activeLedgerId] = contacts;
    if (archivedContacts !== undefined) lastArchivedContactsCache[activeLedgerId] = archivedContacts;
    if (allContacts !== undefined) lastAllContactsCache[activeLedgerId] = allContacts;
  }

  const effectiveContacts = contacts !== undefined ? contacts : (activeLedgerId ? lastContactsCache[activeLedgerId] : undefined);
  const effectiveArchivedContacts = archivedContacts !== undefined ? archivedContacts : (activeLedgerId ? lastArchivedContactsCache[activeLedgerId] : undefined);
  const effectiveAllContacts = allContacts !== undefined ? allContacts : (activeLedgerId ? lastAllContactsCache[activeLedgerId] : undefined);

  const addContact = async (
    name: string,
    group: string = 'personal',
    currency?: string,
    note?: string
  ): Promise<Contact | null> => {
    if (!activeLedgerId) return null;
    const now = new Date().toISOString();
    const newContact: Contact = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      group,
      currency,
      note,
      archived: false,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await db.contacts.add(newContact);
    return newContact;
  };

  const updateContact = async (id: string, updates: Partial<Contact>) => {
    await db.contacts.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const archiveContact = async (id: string) => {
    await db.contacts.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
  };

  const unarchiveContact = async (id: string) => {
    await db.contacts.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteContact = async (id: string): Promise<{ success: boolean; reason?: string }> => {
    // Check if contact has any transactions via accountId, toAccountId, or reimbursementContactId
    const [fromCount, toCount, reimbCount] = await Promise.all([
      db.transactions.where('accountId').equals(id).filter(t => !t.deleted).count(),
      db.transactions.where('toAccountId').equals(id).filter(t => !t.deleted).count(),
      db.transactions.where('reimbursementContactId').equals(id).filter(t => !t.deleted).count(),
    ]);

    if (fromCount > 0 || toCount > 0 || reimbCount > 0) {
      return { success: false, reason: 'has_transactions' };
    }

    await db.contacts.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  };

  return {
    contacts: effectiveContacts,
    archivedContacts: effectiveArchivedContacts,
    allContacts: effectiveAllContacts,
    addContact,
    updateContact,
    archiveContact,
    unarchiveContact,
    deleteContact,
  };
}
