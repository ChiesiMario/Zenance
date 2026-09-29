import { scanDatabaseIntegrity } from './integrityScanner';
import { repairDatabaseIntegrity } from './integrityHealer';

export * from './integrityTypes';
export * from './integrityScanner';
export * from './integrityHealer';

const LAST_SILENT_CHECK_KEY = 'zenance_fsck_last_silent_check';

/**
 * 背景無感低優先級自檢與自癒 (每 7 天於閒置時自動排程執行一次)
 */
export async function runSilentHealthCheck(): Promise<void> {
  try {
    const raw = localStorage.getItem(LAST_SILENT_CHECK_KEY);
    const lastCheck = raw ? parseInt(raw, 10) : 0;
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    if (now - lastCheck < SEVEN_DAYS_MS) {
      return;
    }

    const report = await scanDatabaseIntegrity();
    if (report.issues.length > 0) {
      const res = await repairDatabaseIntegrity(report);
      if (res.repairedCount > 0) {
        console.info(`[FSCK] 背景自檢完成：已安全自癒修復 ${res.repairedCount} 項資料庫隱性問題。`);
      }
    }

    localStorage.setItem(LAST_SILENT_CHECK_KEY, String(now));
  } catch (err) {
    // 背景靜默防禦，不干擾主執行緒
  }
}
