import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useCategories } from '@/hooks/useCategories';
import type { Category } from '@/services/db/db';

export interface BudgetCategoryPickerProps {
  categories?: Category[];
  expenseCategories?: Category[];
  selectedCategoryIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function BudgetCategoryPicker({
  categories: explicitCategories,
  expenseCategories,
  selectedCategoryIds,
  onChange,
  className,
}: BudgetCategoryPickerProps) {
  const { t } = useTranslation();
  const { allCategories } = useCategories();

  const categories = useMemo(() => {
    if (explicitCategories) return explicitCategories;
    if (expenseCategories) return expenseCategories;
    return allCategories?.filter((c) => c.type === 'expense') || [];
  }, [explicitCategories, expenseCategories, allCategories]);

  const toggleCategory = (catId: string) => {
    if (selectedCategoryIds.includes(catId)) {
      onChange(selectedCategoryIds.filter((id) => id !== catId));
    } else {
      onChange([...selectedCategoryIds, catId]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-baseline">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('budgets.categories')}
        </label>
        <span className="text-[11px] text-muted-foreground">
          {selectedCategoryIds.length === 0
            ? t('budgets.noCategoriesSelected')
            : t('budgets.categoriesSelected', { count: selectedCategoryIds.length })}
        </span>
      </div>

      <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 flex flex-wrap gap-1.5 bg-background">
        {categories.length > 0 ? (
          categories.map((cat) => {
            const isSelected = selectedCategoryIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 cursor-pointer',
                  isSelected
                    ? 'bg-foreground text-background border-foreground font-medium'
                    : 'border-border bg-card text-card-foreground hover:bg-muted'
                )}
              >
                <span>{cat.name}</span>
              </button>
            );
          })
        ) : (
          <div className="w-full py-4 text-center text-xs text-muted-foreground">
            {t('budgets.noCategoriesAvailable')}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        {t('budgets.categoriesHint', '勾選分類後，相關支出將自動納入預算；未設定亦可於記帳時手動指定。')}
      </p>
    </div>
  );
}
