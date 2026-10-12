import type { Account } from '@/services/db/db';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'loan';
export type LoanType = 'borrow' | 'lend';
export type KeypadFocusedField = 'out' | 'in' | 'fee';

export interface AccountSelectConfig {
  open: boolean;
  title?: string;
  selectedAccountId?: string;
  disabledAccountIds?: string[];
  disabledReason?: string;
  filterType?: 'wallet' | 'contact' | 'all';
  onSelect: (acc: Account) => void;
}

export interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  initialLoanType?: LoanType;
  transactionToEditId?: string | null;
  initialContactId?: string | null;
  initialToAccountId?: string | null;
  initialAmount?: number | null;
  initialAccountId?: string | null;
  initialCategoryId?: string | null;
  initialNote?: string | null;
}
