import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';

// 模組級單例記憶體快取：紀錄各帳本最新一次成功 Resolve 的分類列表，消除組件首次掛載的空白空隙
const lastCategoriesCache: Record<string, Category[]> = {};
const lastArchivedCategoriesCache: Record<string, Category[]> = {};
const lastAllCategoriesCache: Record<string, Category[]> = {};

export function useCategories() {
  const { activeLedgerId } = useAppStore();

  // 自動遷移歷史「差額吸收 / 抹零」分類與舊備註
  useEffect(() => {
    if (!activeLedgerId) return;

    db.categories
      .filter(c => !c.deleted && (c.name.includes('差額吸收') || c.name.includes('差额吸收')))
      .modify({ name: '抹零', updatedAt: new Date().toISOString() })
      .catch(() => {});

    db.transactions
      .filter(t => !t.deleted && (t.note === '抹零 / 自行吸收差額' || t.note === '抹零 / 自行吸收差额'))
      .modify({ note: '報銷抹零', updatedAt: new Date().toISOString() })
      .catch(() => {});
  }, [activeLedgerId]);

  const categories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted && !c.archived && !c.isSystem)
        .toArray();
    },
    [activeLedgerId]
  );

  const archivedCategories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted && c.archived === true && !c.isSystem)
        .toArray();
    },
    [activeLedgerId]
  );

  const allCategories = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Category[]);
      return db.categories
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(c => !c.deleted)
        .toArray();
    },
    [activeLedgerId]
  );

  if (activeLedgerId && categories !== undefined) {
    lastCategoriesCache[activeLedgerId] = categories;
  }
  if (activeLedgerId && archivedCategories !== undefined) {
    lastArchivedCategoriesCache[activeLedgerId] = archivedCategories;
  }
  if (activeLedgerId && allCategories !== undefined) {
    lastAllCategoriesCache[activeLedgerId] = allCategories;
  }

  const effectiveCategories = categories !== undefined
    ? categories
    : (activeLedgerId ? lastCategoriesCache[activeLedgerId] : undefined);

  const effectiveArchivedCategories = archivedCategories !== undefined
    ? archivedCategories
    : (activeLedgerId ? lastArchivedCategoriesCache[activeLedgerId] : undefined);

  const effectiveAllCategories = allCategories !== undefined
    ? allCategories
    : (activeLedgerId ? lastAllCategoriesCache[activeLedgerId] : undefined);

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
      .where('category')
      .equals(id)
      .filter(t => !t.deleted)
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

    const currentCount = await db.categories
      .where('ledgerId')
      .equals(activeLedgerId)
      .filter(c => !c.deleted)
      .count();
    
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

  const getOrCreateSystemBalanceAdjustmentCategory = async (type: 'income' | 'expense', name: string) => {
    if (!activeLedgerId) return null;
    const existing = await db.categories
      .where('ledgerId')
      .equals(activeLedgerId)
      .filter(
        c =>
          !c.deleted &&
          c.isSystem === true &&
          c.type === type &&
          !c.name.includes('退款') &&
          !c.name.toLowerCase().includes('refund')
      )
      .first();
    if (existing) {
      if (existing.name !== name) {
        await updateCategory(existing.id, name);
        existing.name = name;
      }
      return existing;
    }
    
    const newCategory: Category = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
      isSystem: true,
    };
    await db.categories.add(newCategory);
    return newCategory;
  };

  const getOrCreateSystemRefundCategory = async (type: 'income' | 'expense', name: string = '退款') => {
    if (!activeLedgerId) return null;
    const existing = await db.categories
      .where('ledgerId')
      .equals(activeLedgerId)
      .filter(
        c =>
          !c.deleted &&
          c.isSystem === true &&
          c.type === type &&
          (c.name.includes('退款') || c.name.toLowerCase().includes('refund'))
      )
      .first();
    if (existing) {
      if (existing.name !== name) {
        await updateCategory(existing.id, name);
        existing.name = name;
      }
      return existing;
    }
    
    const newCategory: Category = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name,
      type,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
      isSystem: true,
    };
    await db.categories.add(newCategory);
    return newCategory;
  };

  return {
    categories: effectiveCategories,
    archivedCategories: effectiveArchivedCategories,
    allCategories: effectiveAllCategories,
    isLoading: effectiveAllCategories === undefined,
    addCategory,
    updateCategory,
    archiveCategory,
    unarchiveCategory,
    deleteCategory,
    initDefaultCategories,
    getOrCreateSystemBalanceAdjustmentCategory,
    getOrCreateSystemRefundCategory,
  };
}
