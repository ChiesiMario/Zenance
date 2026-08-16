import { create } from 'zustand';

interface AppState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  setSyncing: (isSyncing: boolean) => void;
  setLastSyncTime: (time: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSyncing: false,
  lastSyncTime: null,
  setSyncing: (isSyncing) => set({ isSyncing }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
}));
