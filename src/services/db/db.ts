import Dexie, { type Table } from 'dexie';

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  note?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  deleted: boolean; // Soft delete flag for sync
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export class ZenanceDatabase extends Dexie {
  transactions!: Table<Transaction>;
  categories!: Table<Category>;

  constructor() {
    super('ZenanceDB');
    this.version(2).stores({
      transactions: 'id, date, type, updatedAt, deleted', // Indexed properties
      categories: 'id, type, isDefault, updatedAt, deleted',
    });
  }
}

export const db = new ZenanceDatabase();
