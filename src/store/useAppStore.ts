import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  activeLedgerId: string | null;
  setSyncing: (isSyncing: boolean) => void;
  setLastSyncTime: (time: string) => void;
  setActiveLedgerId: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSyncing: false,
      lastSyncTime: null,
      activeLedgerId: null,
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
      setActiveLedgerId: (id) => set({ activeLedgerId: id }),
    }),
    {
      name: 'zenance-app-storage',
      partialize: (state) => ({ activeLedgerId: state.activeLedgerId, lastSyncTime: state.lastSyncTime }),
    }
  )
);
