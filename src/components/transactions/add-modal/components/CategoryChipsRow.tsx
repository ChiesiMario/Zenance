import { useTranslation } from 'react-i18next';
import { Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import type { Category } from '@/services/db/db';

interface CategoryChipsRowProps {
  filteredCategories: Category[];
  displayedPills: Category[];
  selectedCategoryId?: string;
  predictedCategoryId?: string;
  isCategoryWarning: boolean;
  onSelectCategory: (categoryId: string) => void;
  onOpenMoreCategories: () => void;
  onOpenCreateCategory: () => void;
}

export function CategoryChipsRow({
  filteredCategories,
  displayedPills,
  selectedCategoryId,
  predictedCategoryId,
  isCategoryWarning,
  onSelectCategory,
  onOpenMoreCategories,
  onOpenCreateCategory,
}: CategoryChipsRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 w-full">
      {filteredCategories.length > 0 ? (
        <>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {displayedPills.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              const isPredicted = predictedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectCategory(cat.id);
                  }}
                  className={cn(
                    "px-3.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-sm sm:text-xs font-medium shrink-0 transition-colors duration-500 cursor-pointer border flex items-center gap-1",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-semibold shadow-none"
                      : isCategoryWarning
                      ? "bg-muted/80 border-destructive/80 text-foreground hover:border-foreground/40"
                      : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  {isPredicted && (
                    <Sparkles
                      className={cn(
                        "w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0",
                        isSelected ? "text-primary-foreground" : "text-amber-500 animate-pulse"
                      )}
                    />
                  )}
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenMoreCategories}
            className={cn(
              "px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-medium border border-dashed shrink-0 transition-colors duration-500 cursor-pointer flex items-center gap-1 ml-auto",
              isCategoryWarning
                ? "border-destructive/80 text-foreground hover:border-foreground/50"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            )}
            title={t('add.moreCategories', '更多分類')}
          >
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-xs sm:text-[11px]">{t('common.more', '更多')}</span>
          </button>
        </>
      ) : (
        <div className="w-full flex items-center justify-center py-0.5 select-none">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenCreateCategory();
            }}
            className={cn(
              "px-3.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-sm sm:text-xs font-medium border border-dashed transition-colors duration-500 cursor-pointer flex items-center gap-1.5",
              isCategoryWarning
                ? "border-destructive/80 text-foreground hover:border-foreground/50"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            )}
          >
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span>{t('add.createCategory')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
