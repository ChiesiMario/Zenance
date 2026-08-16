import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Ledger } from '@/services/db/db';

export function useLedgers() {
  const ledgers = useLiveQuery(
    () => db.ledgers.filter(l => !l.deleted).toArray()
  );

  const addLedger = async (name: string, baseCurrency: string = 'CNY'): Promise<Ledger> => {
    const isFirstLedger = await db.ledgers.filter(l => !l.deleted).count() === 0;
    
    const newLedger: Ledger = {
      id: crypto.randomUUID(),
      name,
      baseCurrency,
      isDefault: isFirstLedger,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.ledgers.add(newLedger);
    return newLedger;
  };

  const deleteLedger = async (id: string) => {
    await db.ledgers.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    ledgers,
    addLedger,
    deleteLedger,
  };
}
