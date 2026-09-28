import { useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BalanceSnapshot } from '@/services/db/db';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { generateDueMonthlySnapshots } from '@/services/balance/snapshotService';

export function useBalanceSnapshots() {
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();
  const hasTriggeredRef = useRef<string | null>(null);

  const activeLedger = useMemo(() => {
    return ledgers?.find((l) => l.id === activeLedgerId);
  }, [ledgers, activeLedgerId]);

  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  // 即時訂閱當前帳本的所有餘額快照
  const snapshots = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as BalanceSnapshot[]);
      return db.balance_snapshots
        .where('ledgerId')
        .equals(activeLedgerId)
        .toArray();
    },
    [activeLedgerId]
  );

  // 映射字典: walletId -> 最新月末快照
  const latestSnapshotsMap = useMemo(() => {
    const map = new Map<string, BalanceSnapshot>();
    if (!snapshots) return map;

    for (const snap of snapshots) {
      const existing = map.get(snap.walletId);
      if (!existing || snap.periodKey > existing.periodKey) {
        map.set(snap.walletId, snap);
      }
    }

    return map;
  }, [snapshots]);

  // 背景自動無感補齊歷史結算月份快照
  useEffect(() => {
    if (!activeLedgerId || hasTriggeredRef.current === activeLedgerId) return;
    hasTriggeredRef.current = activeLedgerId;

    const runWorker = () => {
      generateDueMonthlySnapshots(activeLedgerId, getRate, baseCurrency).catch((err) => {
        console.warn('Failed to generate due balance snapshots:', err);
      });
    };

    if ('requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(runWorker, { timeout: 3000 });
      return () => (window as any).cancelIdleCallback?.(handle);
    } else {
      const timer = setTimeout(runWorker, 1200);
      return () => clearTimeout(timer);
    }
  }, [activeLedgerId, getRate, baseCurrency]);

  return {
    snapshots,
    latestSnapshotsMap,
  };
}
