import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';

export function useCategories() {
  const { activeLedgerId } = useAppStore();

  const categories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories.filter(c => !c.deleted && !c.archived && c.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const archivedCategories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories.filter(c => !c.deleted && c.archived === true && c.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const allCategories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories.filter(c => !c.deleted && c.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const addCategory = async (name: string, type: 'income' | 'expense', isDefault = false): Promise<Category> => {
    if (!activeLedgerId) throw new Error('No active ledger');
    const newCategory: Category = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type,
      isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.categories.add(newCategory);
    return newCategory;
  };

  const updateCategory = async (id: string, name: string) => {
    await db.categories.update(id, {
      name,
      updatedAt: new Date().toISOString(),
    });
  };

  const archiveCategory = async (id: string) => {
    await db.categories.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
  };

  const unarchiveCategory = async (id: string) => {
    await db.categories.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteCategory = async (id: string): Promise<{ success: boolean; reason?: string }> => {
    const txCount = await db.transactions
      .filter(t => !t.deleted && t.category === id)
      .count();

    if (txCount > 0) {
      return { success: false, reason: 'has_transactions' };
    }

    await db.categories.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
    
    return { success: true };
  };

  const initDefaultCategories = async () => {
    if (!activeLedgerId) return;
    const defaultExpenseCategories = [
      'Food & Dining', 'Transportation', 'Housing', 'Utilities', 
      'Shopping', 'Entertainment', 'Healthcare', 'Personal Care', 'Education'
    ];
    
    const defaultIncomeCategories = [
      'Salary', 'Investments', 'Freelance', 'Gifts', 'Other Income'
    ];

    const currentCount = await db.categories.filter(c => !c.deleted && c.ledgerId === activeLedgerId).count();
    
    if (currentCount === 0) {
      const categoriesToAdd = [
        ...defaultExpenseCategories.map(name => ({
          id: uuidv4(),
          ledgerId: activeLedgerId,
          name,
          type: 'expense' as const,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deleted: false,
        })),
        ...defaultIncomeCategories.map(name => ({
          id: uuidv4(),
          ledgerId: activeLedgerId,
          name,
          type: 'income' as const,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deleted: false,
        }))
      ];
      
      await db.categories.bulkAdd(categoriesToAdd);
    }
  };

  return {
    categories,
    archivedCategories,
    allCategories,
    addCategory,
    updateCategory,
    archiveCategory,
    unarchiveCategory,
    deleteCategory,
    initDefaultCategories,
  };
}
