import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useExchangeRates, COMMON_CURRENCIES } from '@/hooks/useExchangeRates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AddTransaction() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();
  const { categories, addCategory } = useCategories();
  const { accounts } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();
  
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [newCatName, setNewCatName] = useState('');
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);
  const [customExchangeRate, setCustomExchangeRate] = useState<number | null>(null);

  // Sync selectedCurrency with baseCurrency initially when ledgers load
  useEffect(() => {
    setSelectedCurrency(baseCurrency);
  }, [baseCurrency]);

  const formSchema = z.object({
    amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
    categoryId: type === 'transfer' ? z.string().optional() : z.string().min(1, t('add.errors.categoryRequired')),
    accountId: type === 'transfer' ? z.string().optional() : z.string().min(1, t('add.errors.accountRequired')),
    fromAccountId: type === 'transfer' ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    toAccountId: type === 'transfer' ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    date: z.string().min(1, t('add.errors.dateRequired')),
    note: z.string().optional(),
  }).refine((data) => {
    if (type === 'transfer' && data.fromAccountId && data.toAccountId && data.fromAccountId === data.toAccountId) {
      return false;
    }
    return true;
  }, {
    message: t('add.errors.sameAccount'),
    path: ['toAccountId'],
  });

  type FormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '' as unknown as number,
      categoryId: '',
      accountId: '',
      fromAccountId: '',
      toAccountId: '',
      date: new Date().toISOString().split('T')[0],
      note: '',
    },
  });

  const selectedCategoryId = watch('categoryId');
  const selectedAccountId = watch('accountId');
  const selectedFromAccountId = watch('fromAccountId');
  const selectedToAccountId = watch('toAccountId');
  
  const filteredCategories = categories?.filter(c => c.type === type) || [];

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const defaultAcc = accounts.find(a => a.isDefault) || accounts[0];
      if (type !== 'transfer' && !selectedAccountId) {
        setValue('accountId', defaultAcc.id);
      }
      if (type === 'transfer' && !selectedFromAccountId) {
        setValue('fromAccountId', defaultAcc.id);
      }
    }
  }, [accounts, type, setValue, selectedAccountId, selectedFromAccountId]);

  const onSubmit = async (data: FormValues) => {
    const exchangeRate = customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency);
    const calculatedBaseAmount = data.amount * exchangeRate;

    await addTransaction({
      originalAmount: data.amount,
      originalCurrency: selectedCurrency,
      exchangeRate: exchangeRate,
      amount: calculatedBaseAmount,
      type,
      category: type === 'transfer' ? 'transfer' : data.categoryId!,
      accountId: type === 'transfer' ? data.fromAccountId! : data.accountId!,
      toAccountId: type === 'transfer' ? data.toAccountId : undefined,
      date: data.date,
      note: data.note,
    });
    navigate('/');
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const newCat = await addCategory(newCatName.trim(), type as 'expense'|'income');
    setValue('categoryId', newCat.id);
    setNewCatName('');
    setIsCatDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-8">
      
      {/* Pill Toggle for Expense / Income / Transfer */}
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 bg-muted/50 rounded-full border border-border">
          <button
            type="button"
            onClick={() => { setType('expense'); reset(); }}
            className={cn("px-4 sm:px-6 py-1.5 rounded-full text-sm font-medium transition-colors", type === 'expense' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
          >
            {t('add.expense')}
          </button>
          <button
            type="button"
            onClick={() => { setType('income'); reset(); }}
            className={cn("px-4 sm:px-6 py-1.5 rounded-full text-sm font-medium transition-colors", type === 'income' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
          >
            {t('add.income')}
          </button>
          <button
            type="button"
            onClick={() => { setType('transfer'); reset(); }}
            className={cn("px-4 sm:px-6 py-1.5 rounded-full text-sm font-medium transition-colors", type === 'transfer' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
          >
            {t('add.transfer')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 flex flex-col items-center">
        
        {/* Borderless Large Input */}
        <div className="w-full flex flex-col items-center gap-2">
          <div className="w-full text-center relative group flex justify-center items-center gap-2">
            <Select value={selectedCurrency} onValueChange={(val) => { if (val) { setSelectedCurrency(val); setCustomExchangeRate(null); } }}>
              <SelectTrigger className="w-auto border-none shadow-none text-xl font-medium focus:ring-0 px-2 translate-y-[-2px] bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Exchange Rate Info Area */}
          {selectedCurrency !== baseCurrency && (
            <div className="w-full max-w-sm mt-4 p-4 border border-border rounded-lg bg-muted/20 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Exchange Rate</span>
                <Input 
                  type="number" 
                  className="w-24 h-7 text-right font-mono text-sm px-2 bg-transparent border-border" 
                  value={customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency).toFixed(4)}
                  onChange={(e) => setCustomExchangeRate(parseFloat(e.target.value) || 1)}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Base Amount ({baseCurrency})</span>
                <span className="font-mono font-medium text-foreground">
                  {((watch('amount') || 0) * (customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* List-style Settings */}
        <div className="w-full border border-border rounded-lg bg-card text-card-foreground overflow-hidden">
          
          {type !== 'transfer' ? (
            <>
              {/* Account Selection */}
              <div className="p-4 border-b border-border">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.account')}</p>
                <div className="flex flex-wrap gap-2">
                  {accounts?.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md border transition-colors",
                        selectedAccountId === acc.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted"
                      )}
                      onClick={() => setValue('accountId', acc.id)}
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
                {errors.accountId && <p className="text-sm font-medium text-destructive mt-3">{errors.accountId.message}</p>}
              </div>

              {/* Category Selection */}
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
                          placeholder={t('add.newCategoryPlaceholder')}
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
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
            </>
          ) : (
            <>
              {/* Transfer From Account */}
              <div className="p-4 border-b border-border">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.fromAccount')}</p>
                <div className="flex flex-wrap gap-2">
                  {accounts?.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md border transition-colors",
                        selectedFromAccountId === acc.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted"
                      )}
                      onClick={() => setValue('fromAccountId', acc.id)}
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
                {errors.fromAccountId && <p className="text-sm font-medium text-destructive mt-3">{errors.fromAccountId.message}</p>}
              </div>

              {/* Transfer To Account */}
              <div className="p-4 border-b border-border">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.toAccount')}</p>
                <div className="flex flex-wrap gap-2">
                  {accounts?.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md border transition-colors",
                        selectedToAccountId === acc.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted"
                      )}
                      onClick={() => setValue('toAccountId', acc.id)}
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
                {errors.toAccountId && <p className="text-sm font-medium text-destructive mt-3">{errors.toAccountId.message}</p>}
              </div>
            </>
          )}

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
