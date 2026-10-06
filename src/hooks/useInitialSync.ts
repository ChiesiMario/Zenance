import { useState, useEffect } from 'react';
import {
  subscribeInitialSyncState,
  getInitialSyncState,
  submitE2EEPassphrase,
  selectStrategy,
  cancelInitialSync,
  closeInitialSyncModal,
  type InitialSyncState,
} from '@/services/sync/initialSyncManager';

export function useInitialSync() {
  const [state, setState] = useState<InitialSyncState>(getInitialSyncState());

  useEffect(() => {
    const unsubscribe = subscribeInitialSyncState(setState);
    return unsubscribe;
  }, []);

  return {
    ...state,
    submitE2EEPassphrase,
    selectStrategy,
    cancelInitialSync,
    closeInitialSyncModal,
  };
}
