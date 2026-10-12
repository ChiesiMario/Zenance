import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Category } from '@/services/db/db';

interface CategoryPickerQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'expense' | 'income';
  filteredCategories: Category[];
  frequentCategories: Category[];
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string) => void;
  onRequestCreateCategory: () => void;
}

export function CategoryPickerQuickDialog({
  open,
  onOpenChange,
  type,
  filteredCategories,
  frequentCategories,
  selectedCategoryId,
  onSelectCategory,
  onRequestCreateCategory,
}: CategoryPickerQuickDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[70] w-[300px] max-w-[calc(100vw-32px)] sm:w-[300px] sm:max-w-[300px] bg-card border border-border text-card-foreground p-4"
      >
        <DialogHeader>
          <DialogTitle className="text-card-foreground text-base font-semibold">
            {type === 'expense'
              ? t('add.expenseCategories', '支出分類')
              : t('add.incomeCategories', '收入分類')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto no-scrollbar py-2">
          {filteredCategories.length === 0 && (
            <div className="w-full py-4 text-center text-xs text-muted-foreground">
              {t('add.noCategoriesAvailable')}
            </div>
          )}

          {frequentCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectCategory(cat.id);
                  onOpenChange(false);
                }}
                className={cn(
                  "px-3.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-sm sm:text-xs font-medium shrink-0 transition-colors duration-500 cursor-pointer border flex items-center gap-1",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary font-semibold shadow-none"
                    : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
              >
                <span>{cat.name}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              onRequestCreateCategory();
            }}
            className="px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors duration-500 cursor-pointer flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-xs sm:text-[11px]">{t('add.addCategory', '新增分類')}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
