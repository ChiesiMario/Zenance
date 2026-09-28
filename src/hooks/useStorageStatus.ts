import { useState, useEffect, useCallback } from 'react';
import {
  isStoragePersisted,
  requestStoragePersistence,
  getStorageEstimate,
  type StorageEstimateResult,
} from '@/services/storage/storageManager';

export function useStorageStatus() {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimateResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [persisted, est] = await Promise.all([
        isStoragePersisted(),
        getStorageEstimate(),
      ]);
      setIsPersisted(persisted);
      setEstimate(est);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestPersistence = useCallback(async (): Promise<boolean> => {
    const granted = await requestStoragePersistence();
    setIsPersisted(granted);
    await refreshStatus();
    return granted;
  }, [refreshStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    isPersisted,
    estimate,
    isLoading,
    requestPersistence,
    refreshStatus,
  };
}
