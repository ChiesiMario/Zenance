import { useState, useCallback } from 'react';
import {
  scanDatabaseIntegrity,
  repairDatabaseIntegrity,
  type IntegrityReport,
} from '@/services/fsck';
import { useAppStore } from '@/store/useAppStore';

export function useDatabaseHealth() {
  const { activeLedgerId } = useAppStore();
  const [isScanning, setIsScanning] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);

  const runScan = useCallback(async (targetLedgerId?: string): Promise<IntegrityReport> => {
    setIsScanning(true);
    try {
      const res = await scanDatabaseIntegrity(targetLedgerId || activeLedgerId || undefined);
      setReport(res);
      return res;
    } finally {
      setIsScanning(false);
    }
  }, [activeLedgerId]);

  const runHeal = useCallback(async (): Promise<{ success: boolean; repairedCount: number }> => {
    if (!report || report.issues.length === 0) {
      return { success: true, repairedCount: 0 };
    }

    setIsHealing(true);
    try {
      const res = await repairDatabaseIntegrity(report);
      // 修復後重新執行一次掃描，更新為 100 分狀態
      if (res.success) {
        const freshReport = await scanDatabaseIntegrity(activeLedgerId || undefined);
        setReport(freshReport);
      }
      return res;
    } finally {
      setIsHealing(false);
    }
  }, [report, activeLedgerId]);

  return {
    isScanning,
    isHealing,
    report,
    setReport,
    runScan,
    runHeal,
  };
}
