import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Ledger } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { scheduleAutoSync } from '@/services/sync/syncEngine';

export function useLedgers() {
  const ledgers = useLiveQuery(
    () => db.ledgers.filter(l => !l.deleted).toArray()
  );

  const addLedger = async (name: string, baseCurrency: string = 'CNY'): Promise<Ledger> => {
    const isFirstLedger = await db.ledgers.filter(l => !l.deleted).count() === 0;
    
    const newLedger: Ledger = {
      id: uuidv4(),
      name,
      baseCurrency,
      isDefault: isFirstLedger,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.ledgers.add(newLedger);
    scheduleAutoSync();
    return newLedger;
  };

  const deleteLedger = async (id: string) => {
    await db.ledgers.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
    scheduleAutoSync();
  };

  const updateLedger = async (id: string, updates: Partial<Ledger>) => {
    await db.ledgers.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    scheduleAutoSync();
  };

  return {
    ledgers,
    addLedger,
    updateLedger,
    deleteLedger,
  };
}
