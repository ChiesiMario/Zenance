import type {
  Ledger,
  Account,
  Contact,
  Category,
  Budget,
  BudgetRule,
  Transaction,
} from '@/services/db/db';

export interface LedgerBackupItem {
  ledger: Ledger;
  accounts: Account[];
  contacts?: Contact[];
  categories: Category[];
  budgets: Budget[];
  budgetRules: BudgetRule[];
  transactions: Transaction[];
}

export interface ParsedBackup {
  manifest?: {
    appName?: string;
    schemaVersion?: number;
    exportedAt?: string;
    totalLedgers?: number;
  };
  ledgersData: LedgerBackupItem[];
}

export type DropboxModalView = 'overview' | 'enable_e2ee' | 'recovery_key';
