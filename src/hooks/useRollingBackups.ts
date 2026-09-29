import { useState, useEffect, useCallback } from 'react';
import {
  isOPFSSupported,
  performRollingBackup,
  getAvailableRollingSnapshots,
  downloadRollingBackupFile,
  readOpfsFile,
  parseBackupZipBlob,
  type ParsedZipBackup,
} from '@/services/storage/opfsBackupService';

export function useRollingBackups() {
  const [isSupported, setIsSupported] = useState<boolean>(isOPFSSupported);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState(getAvailableRollingSnapshots);

  const refreshSnapshots = useCallback(() => {
    setSnapshots(getAvailableRollingSnapshots());
  }, []);

  useEffect(() => {
    setIsSupported(isOPFSSupported());
    refreshSnapshots();
  }, [refreshSnapshots]);

  const triggerBackup = useCallback(async (force = true): Promise<boolean> => {
    setIsBackingUp(true);
    try {
      const success = await performRollingBackup(force);
      refreshSnapshots();
      return success;
    } finally {
      setIsBackingUp(false);
    }
  }, [refreshSnapshots]);

  const exportBackupFile = useCallback(async (filename: string): Promise<boolean> => {
    return await downloadRollingBackupFile(filename);
  }, []);

  const loadBackupForRestore = useCallback(async (filename: string): Promise<ParsedZipBackup | null> => {
    const blob = await readOpfsFile(filename);
    if (!blob) return null;
    return await parseBackupZipBlob(blob);
  }, []);

  return {
    isSupported,
    isBackingUp,
    snapshots,
    triggerBackup,
    exportBackupFile,
    loadBackupForRestore,
    refreshSnapshots,
  };
}
