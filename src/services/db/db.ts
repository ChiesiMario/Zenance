import Dexie, { type Table } from 'dexie';

export interface Ledger {
  id: string;
  name: string;
  baseCurrency: string; // The default currency for the ledger
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface Transaction {
  id: string;
  displayId?: string; // Human-readable serial number
  ledgerId: string;
  amount: number; // Base currency amount
  originalAmount: number; // Original currency amount
  originalCurrency: string; // The currency code for this transaction
  exchangeRate: number; // Rate used to convert to base currency
  type: 'income' | 'expense' | 'transfer';
  category: string;
  accountId: string; // The account for income/expense, or the "from" account for transfer
  toAccountId?: string; // The "to" account for transfer
  note?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deleted: boolean; // Soft delete flag for sync
}

export interface ExchangeRate {
  currency: string;
  rate: number; // Rate relative to USD (1 USD = X Currency)
  updatedAt: string;
}

export interface Category {
  id: string;
  ledgerId: string;
  name: string;
  type: 'income' | 'expense';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface Account {
  id: string;
  ledgerId: string;
  name: string;
  type?: 'wallet' | 'contact';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface Budget {
  id: string;
  ledgerId: string;
  name: string;
  amount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export class ZenanceDatabase extends Dexie {
  ledgers!: Table<Ledger>;
  transactions!: Table<Transaction>;
  categories!: Table<Category>;
  accounts!: Table<Account>;
  budgets!: Table<Budget>;
  exchange_rates!: Table<ExchangeRate>;

  constructor() {
    super('ZenanceDB');
    
    this.version(2).stores({
      transactions: 'id, date, type, updatedAt, deleted', // Indexed properties
      categories: 'id, type, isDefault, updatedAt, deleted',
    });

    this.version(3).stores({
      transactions: 'id, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, type, isDefault, updatedAt, deleted',
      accounts: 'id, isDefault, updatedAt, deleted',
    }).upgrade(async tx => {
      // Create a default Cash account during migration
      const cashAccountId = crypto.randomUUID();
      await tx.table('accounts').add({
        id: cashAccountId,
        name: 'Cash',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
      });

      // Assign all existing transactions to this Cash account
      await tx.table('transactions').toCollection().modify(t => {
        t.accountId = cashAccountId;
      });
    });

    this.version(4).stores({
      transactions: 'id, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, type, isDefault, updatedAt, deleted',
      accounts: 'id, isDefault, updatedAt, deleted',
      budgets: 'id, startDate, endDate, updatedAt, deleted',
    });

    this.version(5).stores({
      transactions: 'id, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, type, isDefault, updatedAt, deleted',
      accounts: 'id, type, isDefault, updatedAt, deleted',
      budgets: 'id, startDate, endDate, updatedAt, deleted',
    }).upgrade(async tx => {
      // Set existing accounts to 'wallet' type
      await tx.table('accounts').toCollection().modify(a => {
        if (!a.type) a.type = 'wallet';
      });
    });

    this.version(6).stores({
      ledgers: 'id, isDefault, updatedAt, deleted',
      transactions: 'id, ledgerId, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      accounts: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      budgets: 'id, ledgerId, startDate, endDate, updatedAt, deleted',
    }).upgrade(async tx => {
      const defaultLedgerId = crypto.randomUUID();
      const now = new Date().toISOString();
      
      // Create default ledger
      await tx.table('ledgers').add({
        id: defaultLedgerId,
        name: 'Personal',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      });

      // Migrate existing records to the default ledger
      await tx.table('transactions').toCollection().modify(t => {
        t.ledgerId = defaultLedgerId;
      });
      await tx.table('categories').toCollection().modify(c => {
        c.ledgerId = defaultLedgerId;
      });
      await tx.table('accounts').toCollection().modify(a => {
        a.ledgerId = defaultLedgerId;
      });
      await tx.table('budgets').toCollection().modify(b => {
        b.ledgerId = defaultLedgerId;
      });
    });

    this.version(7).stores({
      ledgers: 'id, isDefault, updatedAt, deleted',
      transactions: 'id, ledgerId, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      accounts: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      budgets: 'id, ledgerId, startDate, endDate, updatedAt, deleted',
      exchange_rates: 'currency, updatedAt',
    }).upgrade(async tx => {
      // Default to CNY for existing ledgers based on user request
      await tx.table('ledgers').toCollection().modify(l => {
        l.baseCurrency = 'CNY';
      });
      
      // Populate transactions with originalAmount, currency and rate
      await tx.table('transactions').toCollection().modify(t => {
        t.originalAmount = t.amount;
        t.originalCurrency = 'CNY';
        t.exchangeRate = 1;
      });
    });

    this.version(8).stores({
      ledgers: 'id, isDefault, updatedAt, deleted',
      transactions: 'id, displayId, ledgerId, date, type, accountId, toAccountId, updatedAt, deleted',
      categories: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      accounts: 'id, ledgerId, type, isDefault, updatedAt, deleted',
      budgets: 'id, ledgerId, startDate, endDate, updatedAt, deleted',
      exchange_rates: 'currency, updatedAt',
    }).upgrade(async tx => {
      // Add displayId for existing transactions
      await tx.table('transactions').toCollection().modify(t => {
        if (!t.displayId) {
          t.displayId = t.id.split('-')[0].toUpperCase();
        }
      });
    });
  }
}

export const db = new ZenanceDatabase();
