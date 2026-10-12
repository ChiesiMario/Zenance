import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface AddCategoryQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'expense' | 'income';
  onAddCategory: (categoryName: string) => Promise<void>;
}

export function AddCategoryQuickDialog({
  open,
  onOpenChange,
  type,
  onAddCategory,
}: AddCategoryQuickDialogProps) {
  const { t } = useTranslation();
  const [newCatName, setNewCatName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddCategory(trimmed);
      setNewCatName('');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setNewCatName('');
        }
      }}
    >
      <DialogContent
        overlayClassName="z-[80]"
        className="z-[80] sm:max-w-[320px] bg-card border border-border text-card-foreground p-4"
      >
        <DialogHeader>
          <DialogTitle className="text-card-foreground text-base">
            {type === 'expense' ? t('add.addExpenseCategory') : t('add.addIncomeCategory')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder={t('add.newCategoryPlaceholder')}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 border-border text-foreground hover:bg-muted"
          >
            {t('add.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!newCatName.trim() || isSubmitting}
            className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t('add.addCategory')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
