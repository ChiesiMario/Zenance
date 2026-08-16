import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '../services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useEffect } from 'react';

const DEFAULT_CATEGORIES = [
  { name: '飲食', type: 'expense' as const },
  { name: '交通', type: 'expense' as const },
  { name: '娛樂', type: 'expense' as const },
  { name: '購物', type: 'expense' as const },
  { name: '居住', type: 'expense' as const },
  { name: '薪水', type: 'income' as const },
  { name: '投資', type: 'income' as const },
  { name: '其他', type: 'income' as const },
];

export function useCategories() {
  const categories = useLiveQuery(() => 
    db.categories
      .filter(c => !c.deleted)
      .toArray()
  );

  // Initialize default categories if database is empty
  useEffect(() => {
    const initDefaultCategories = async () => {
      const count = await db.categories.count();
      if (count === 0) {
        const now = new Date().toISOString();
        const defaultData = DEFAULT_CATEGORIES.map(cat => ({
          id: uuidv4(),
          name: cat.name,
          type: cat.type,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          deleted: false
        }));
        await db.categories.bulkAdd(defaultData);
      }
    };
    initDefaultCategories();
  }, []);

  const addCategory = async (name: string, type: 'income' | 'expense') => {
    const now = new Date().toISOString();
    const newCategory: Category = {
      id: uuidv4(),
      name,
      type,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await db.categories.add(newCategory);
    return newCategory;
  };

  const deleteCategory = async (id: string) => {
    const now = new Date().toISOString();
    await db.categories.update(id, {
      deleted: true,
      updatedAt: now,
    });
  };

  return {
    categories,
    addCategory,
    deleteCategory,
  };
}
