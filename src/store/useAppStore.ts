import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  activeLedgerId: string | null;
  setSyncing: (isSyncing: boolean) => void;
  setLastSyncTime: (time: string) => void;
  setActiveLedgerId: (id: string) => void;
  editingTransactionId: string | null;
  setEditingTransactionId: (id: string | null) => void;
  viewingTransactionId: string | null;
  setViewingTransactionId: (id: string | null) => void;
  isAddModalOpen: boolean;
  addModalType: 'expense' | 'income' | 'transfer' | 'loan';
  addModalLoanType: 'borrow' | 'lend';
  addModalContactId: string | null;
  addModalInitialToAccountId?: string | null;
  addModalInitialAmount?: number | null;
  openAddModal: (
    type?: 'expense' | 'income' | 'transfer' | 'loan',
    loanType?: 'borrow' | 'lend',
    contactId?: string,
    initialToAccountId?: string,
    initialAmount?: number
  ) => void;
  closeAddModal: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSyncing: false,
      lastSyncTime: null,
      activeLedgerId: null,
      editingTransactionId: null,
      viewingTransactionId: null,
      isAddModalOpen: false,
      addModalType: 'expense',
      addModalLoanType: 'borrow',
      addModalContactId: null,
      addModalInitialToAccountId: null,
      addModalInitialAmount: null,
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
      setActiveLedgerId: (id) => set({ activeLedgerId: id }),
      setEditingTransactionId: (id) => set({ editingTransactionId: id }),
      setViewingTransactionId: (id) => set({ viewingTransactionId: id }),
      openAddModal: (type = 'expense', loanType = 'borrow', contactId, initialToAccountId, initialAmount) => 
        set({ 
          isAddModalOpen: true, 
          addModalType: type, 
          addModalLoanType: loanType, 
          addModalContactId: contactId || null,
          addModalInitialToAccountId: initialToAccountId || null,
          addModalInitialAmount: initialAmount ?? null,
        }),
      closeAddModal: () => set({ 
        isAddModalOpen: false, 
        addModalContactId: null,
        addModalInitialToAccountId: null,
        addModalInitialAmount: null,
      }),
    }),
    {
      name: 'zenance-app-storage',
      partialize: (state) => ({ activeLedgerId: state.activeLedgerId, lastSyncTime: state.lastSyncTime }),
    }
  )
);
