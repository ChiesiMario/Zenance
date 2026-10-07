import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Ledger } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { scheduleAutoSync } from '@/services/sync/syncEngine';

// 模組級單例記憶體快取：紀錄最新一次成功 Resolve 的帳本列表，消除組件首次掛載的空白空隙
let lastLedgersCache: Ledger[] | undefined = undefined;

export function useLedgers() {
  const ledgers = useLiveQuery(
    () => db.ledgers.filter(l => !l.deleted).toArray()
  );

  if (ledgers !== undefined) {
    lastLedgersCache = ledgers;
  }

  const effectiveLedgers = ledgers !== undefined ? ledgers : lastLedgersCache;

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
    ledgers: effectiveLedgers,
    addLedger,
    updateLedger,
    deleteLedger,
  };
}
