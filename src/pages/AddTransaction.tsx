import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

// Note: Zod schema needs to use the translator or we just pass raw errors or translate in UI.
// For now, we translate Zod errors inside the component, but standard setup passes t to zod.
// Let's create the schema inside the component to use `t`.

export default function AddTransaction() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();
  const { categories, addCategory } = useCategories();
  
  const formSchema = z.object({
    amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
    categoryId: z.string().min(1, t('add.errors.categoryRequired')),
    date: z.string().min(1, t('add.errors.dateRequired')),
    note: z.string().optional(),
  });
  type FormValues = z.infer<typeof formSchema>;
  
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [newCatName, setNewCatName] = useState('');
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '' as unknown as number,
      categoryId: '',
      date: new Date().toISOString().split('T')[0],
      note: '',
    },
  });

  const selectedCategoryId = watch('categoryId');
  const filteredCategories = categories?.filter(c => c.type === type) || [];

  const onSubmit = async (data: FormValues) => {
    await addTransaction({
      amount: data.amount,
      type,
      category: data.categoryId,
      date: data.date,
      note: data.note,
    });
    navigate('/');
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const newCat = await addCategory(newCatName.trim(), type);
    setValue('categoryId', newCat.id);
    setNewCatName('');
    setIsCatDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-8">
      
      {/* Pill Toggle for Expense / Income */}
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 bg-muted/50 rounded-full border border-border">
          <button
            type="button"
            onClick={() => { setType('expense'); setValue('categoryId', ''); }}
            className={cn("px-6 py-1.5 rounded-full text-sm font-medium transition-colors", type === 'expense' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
          >
            {t('add.expense')}
          </button>
          <button
            type="button"
            onClick={() => { setType('income'); setValue('categoryId', ''); }}
            className={cn("px-6 py-1.5 rounded-full text-sm font-medium transition-colors", type === 'income' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
          >
            {t('add.income')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 flex flex-col items-center">
        
        {/* Borderless Large Input */}
        <div className="w-full text-center relative group flex justify-center items-center">
          <span className="text-4xl text-muted-foreground font-mono opacity-50 group-focus-within:text-primary transition-colors translate-y-[-2px]">$</span>
          <Input 
            id="amount" 
            type="number" 
            inputMode="decimal"
            placeholder="0" 
            className="w-auto max-w-[200px] text-6xl h-24 font-mono font-bold tracking-tighter text-left bg-transparent border-none shadow-none focus-visible:ring-0 px-2"
            {...register('amount', { valueAsNumber: true })}
          />
        </div>
        {errors.amount && <p className="text-sm font-medium text-destructive mt-[-1rem]">{errors.amount.message}</p>}

        {/* List-style Settings */}
        <div className="w-full border border-border rounded-lg bg-card text-card-foreground overflow-hidden">
          
          <div className="p-4 border-b border-border">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.category')}</p>
            <div className="flex flex-wrap gap-2">
              {filteredCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    selectedCategoryId === cat.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted"
                  )}
                  onClick={() => setValue('categoryId', cat.id)}
                >
                  {cat.name}
                </button>
              ))}
              <Dialog open={isCatDialogOpen} onOpenChange={setIsCatDialogOpen}>
                <DialogTrigger render={<button type="button" className="px-3 py-1.5 text-sm rounded-md border border-dashed border-border hover:bg-muted text-muted-foreground flex items-center gap-1" />}>
                  <Plus className="h-3.5 w-3.5" /> {t('add.addCategory')}
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>{type === 'expense' ? t('add.addExpenseCategory') : t('add.addIncomeCategory')}</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Input 
                      placeholder={t('add.categoryName')} 
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" type="button" />}>
                      {t('add.cancel')}
                    </DialogClose>
                    <Button type="button" onClick={handleAddCategory} disabled={!newCatName.trim()}>
                      {t('add.addCategory')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {errors.categoryId && <p className="text-sm font-medium text-destructive mt-3">{errors.categoryId.message}</p>}
          </div>

          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('add.date')}</p>
            <Input 
              id="date" 
              type="date" 
              className="w-full sm:w-auto border-none shadow-none focus-visible:ring-0 bg-transparent h-auto p-0 text-left sm:text-right font-medium"
              {...register('date')}
            />
          </div>

          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('add.note')}</p>
            <Input 
              id="note" 
              placeholder={t('add.optional')} 
              className="w-full sm:w-auto border-none shadow-none focus-visible:ring-0 bg-transparent h-auto p-0 text-left sm:text-right font-medium"
              {...register('note')}
            />
          </div>

        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? t('add.saving') : t('add.saveTransaction')}
        </Button>
      </form>
    </div>
  );
}
