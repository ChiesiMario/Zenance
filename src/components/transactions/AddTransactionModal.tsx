import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus, X } from 'lucide-react';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumericKeypad } from './NumericKeypad';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'expense' | 'income' | 'transfer' | 'loan';
}

export function AddTransactionModal({ isOpen, onClose, initialType = 'expense' }: Props) {
  const { t } = useTranslation();
  const { addTransaction } = useTransactions();
  const { categories, addCategory } = useCategories();
  const { wallets: accounts, contacts } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();
  
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const [type, setType] = useState<'expense' | 'income' | 'transfer' | 'loan'>(initialType);
  const [loanType, setLoanType] = useState<'borrow' | 'lend'>('borrow');
  const [newCatName, setNewCatName] = useState('');
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
  const [customExchangeRate, setCustomExchangeRate] = useState<number | null>(null);
  const [displayAmount, setDisplayAmount] = useState('');

  const formSchema = z.object({
    amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
    categoryId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.categoryRequired')),
    accountId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.accountRequired')),
    fromAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    toAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    date: z.string().min(1, t('add.errors.dateRequired')),
    note: z.string().optional(),
  }).refine((data) => {
    if ((type === 'transfer' || type === 'loan') && data.fromAccountId && data.toAccountId && data.fromAccountId === data.toAccountId) {
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
    formState: { errors },
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

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      reset();
      setDisplayAmount('');
    }
  }, [isOpen, initialType, reset]);

  const selectedCategoryId = watch('categoryId');
  const selectedAccountId = watch('accountId');
  const selectedFromAccountId = watch('fromAccountId');
  const selectedToAccountId = watch('toAccountId');
  const selectedDate = watch('date');
  
  const selectedAccount = useMemo(() => accounts?.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);
  const selectedFromAccount = useMemo(() => accounts?.find(a => a.id === selectedFromAccountId), [accounts, selectedFromAccountId]);
  
  const selectedCurrency = (type === 'transfer' || type === 'loan') 
    ? (selectedFromAccount?.currency || baseCurrency) 
    : (selectedAccount?.currency || baseCurrency);
  
  useEffect(() => {
    setCustomExchangeRate(null);
  }, [selectedCurrency]);

  const filteredCategories = categories?.filter(c => c.type === type) || [];

  const { transactions } = useTransactions();
  
  const categoryMonthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!transactions) return totals;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && !t.deleted) {
        if (t.category) {
          totals[t.category] = (totals[t.category] || 0) + t.amount;
        }
      }
    });
    return totals;
  }, [transactions]);
  
  const compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 0 });

  const typeTotal = useMemo(() => {
    return filteredCategories.reduce((sum, cat) => sum + (categoryMonthlyTotals[cat.id] || 0), 0);
  }, [filteredCategories, categoryMonthlyTotals]);



  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const defaultAcc = accounts.find(a => a.isDefault) || accounts[0];
      if (type !== 'transfer' && type !== 'loan' && !selectedAccountId) {
        setValue('accountId', defaultAcc.id);
      }
      if ((type === 'transfer' || type === 'loan') && !selectedFromAccountId) {
        setValue('fromAccountId', defaultAcc.id);
      }
    }
  }, [accounts, type, setValue, selectedAccountId, selectedFromAccountId]);

  useEffect(() => {
    if (type === 'loan' && accounts && accounts.length > 0 && contacts && contacts.length > 0) {
      const defaultWallet = accounts.find(a => a.isDefault) || accounts[0];
      const defaultContact = contacts[0];
      if (loanType === 'borrow') {
        setValue('fromAccountId', defaultContact.id);
        setValue('toAccountId', defaultWallet.id);
      } else {
        setValue('fromAccountId', defaultWallet.id);
        setValue('toAccountId', defaultContact.id);
      }
    }
  }, [type, loanType, accounts, contacts, setValue]);

  const onSubmit = async (data: FormValues) => {
    const exchangeRate = customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency);
    const calculatedBaseAmount = data.amount * exchangeRate;

    await addTransaction({
      originalAmount: data.amount,
      originalCurrency: selectedCurrency,
      exchangeRate: exchangeRate,
      amount: calculatedBaseAmount,
      type,
      category: (type === 'transfer' || type === 'loan') ? (type === 'loan' ? 'loan' : 'transfer') : data.categoryId!,
      accountId: (type === 'transfer' || type === 'loan') ? data.fromAccountId! : data.accountId!,
      toAccountId: (type === 'transfer' || type === 'loan') ? data.toAccountId : undefined,
      date: data.date,
      note: data.note,
    });
    onClose();
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const newCat = await addCategory(newCatName.trim(), type as 'expense'|'income');
    setValue('categoryId', newCat.id);
    setNewCatName('');
    setIsCatDialogOpen(false);
  };

  const handleKeypadSubmit = () => {
    const val = parseFloat(displayAmount);
    if (isNaN(val) || val <= 0) return;
    setValue('amount', val);
    handleSubmit(onSubmit)();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="w-screen h-[100dvh] max-w-none m-0 p-0 gap-0 rounded-none border-none overflow-hidden flex flex-col bg-background sm:w-full sm:max-w-[350px] sm:h-[700px] sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-border" aria-describedby={undefined}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t('nav.add')}</DialogTitle>
        </DialogHeader>
        
        {/* Sticky Top Bar with Title and Close Button */}
        <div className="flex items-center justify-between px-4 py-1 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <div className="w-10"></div> {/* Spacer to keep title centered */}
          
          <div className="flex justify-center flex-1">
            <h2 className="text-lg font-semibold tracking-tight">
              {type === 'expense' && t('add.expense')}
              {type === 'income' && t('add.income')}
              {type === 'transfer' && t('add.transfer')}
              {type === 'loan' && t('add.loan')}
            </h2>
          </div>
          
          <DialogClose className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        {/* Main scrollable area */}
        <div className="flex-1 w-full max-w-xl mx-auto px-5 pt-2 pb-4 overflow-y-auto no-scrollbar space-y-6 animate-in fade-in duration-500">

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 flex flex-col items-center">
        


        {/* List-style Settings */}
        <div className="w-full rounded-lg bg-card text-card-foreground overflow-hidden">
          
          {(type === 'expense' || type === 'income') && (
            <>

              {/* Category Selection */}
              <div className="p-4">
                <div className="grid grid-cols-4 grid-flow-row-dense gap-2 sm:gap-3">
                  {filteredCategories.map(cat => {
                    const isSelected = selectedCategoryId === cat.id;
                    const total = categoryMonthlyTotals[cat.id] || 0;
                    
                    let colSpanClass = "col-span-1";
                    if (typeTotal > 0) {
                      const percentage = total / typeTotal;
                      if (percentage >= 0.5) colSpanClass = "col-span-3";
                      else if (percentage >= 0.1) colSpanClass = "col-span-2";
                    }

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={cn(
                          colSpanClass,
                          "w-full flex flex-col items-center justify-center gap-0.5 h-[50px] py-1.5 px-1 rounded-2xl border transition-all duration-200",
                          isSelected 
                            ? "bg-primary text-primary-foreground border-primary scale-95 shadow-sm" 
                            : "bg-transparent border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setValue('categoryId', cat.id)}
                      >
                        <div className="animate-marquee-pause text-center w-full">
                          <span className="text-[10px] sm:text-xs font-medium">
                            {cat.name}
                          </span>
                        </div>
                        <div className={cn("px-2 py-0.5 h-5 rounded-full flex items-center justify-center overflow-hidden", isSelected ? "bg-primary-foreground/20" : "bg-muted")}>
                           <span className="text-[9px] font-mono font-medium truncate">
                             {total > 0 ? `${currencySymbol}${compactFormatter.format(total)}` : '-'}
                           </span>
                        </div>
                      </button>
                    )
                  })}
                  <Dialog open={isCatDialogOpen} onOpenChange={setIsCatDialogOpen}>
                    <DialogTrigger render={<button type="button" className="w-full flex flex-col items-center justify-center gap-0.5 h-[50px] py-1.5 px-1 rounded-2xl border border-dashed border-border hover:bg-muted text-muted-foreground transition-all duration-200" />}>
                      <span className="text-[10px] sm:text-xs font-medium truncate w-full text-center">
                        {t('add.addCategory')}
                      </span>
                      <div className="px-2 py-0.5 h-5 rounded-full flex items-center justify-center overflow-hidden bg-muted">
                        <Plus className="w-3 h-3" />
                      </div>
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
          )}

          {type === 'transfer' && (
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

          {type === 'loan' && (
             <>
               <div className="p-4 border-b border-border flex justify-center">
                 <div className="inline-flex items-center p-1 bg-muted/50 rounded-full border border-border">
                   <button type="button" onClick={() => setLoanType('borrow')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors", loanType === 'borrow' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}>{t('add.borrow')}</button>
                   <button type="button" onClick={() => setLoanType('lend')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-colors", loanType === 'lend' ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}>{t('add.lend')}</button>
                 </div>
               </div>
               {/* Contact Account */}
               <div className="p-4 border-b border-border">
                 <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.contact')}</p>
                 <div className="flex flex-wrap gap-2">
                   {contacts?.map(acc => (
                     <button key={acc.id} type="button" className={cn("px-3 py-1.5 text-sm rounded-md border transition-colors", (loanType === 'borrow' ? selectedFromAccountId : selectedToAccountId) === acc.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted")} onClick={() => { setValue(loanType === 'borrow' ? 'fromAccountId' : 'toAccountId', acc.id) }}>{acc.name}</button>
                   ))}
                 </div>
               </div>
               {/* Wallet Account */}
               <div className="p-4 border-b border-border">
                 <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{t('add.account')}</p>
                 <div className="flex flex-wrap gap-2">
                   {accounts?.map(acc => (
                     <button key={acc.id} type="button" className={cn("px-3 py-1.5 text-sm rounded-md border transition-colors", (loanType === 'borrow' ? selectedToAccountId : selectedFromAccountId) === acc.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-border hover:bg-muted")} onClick={() => { setValue(loanType === 'borrow' ? 'toAccountId' : 'fromAccountId', acc.id) }}>{acc.name}</button>
                   ))}
                 </div>
               </div>
             </>
          )}



        </div>
      </form>
        </div>
        
        {/* Fixed bottom area: Amount + Keypad */}
        <div className="w-full bg-zinc-950 p-3 pb-safe sm:rounded-b-2xl sm:border-none shadow-2xl">
          <div className="w-full mx-auto max-w-[350px] flex flex-col gap-3">
            
            {/* Account & Note Row */}
            {/* Note Row */}
            <div className="w-full px-1 mt-2">
              <Input 
                id="note" 
                placeholder={t('add.note')} 
                className="w-full h-8 px-3 border-white/10 bg-white/5 text-white shadow-none focus-visible:ring-0 text-xs font-medium rounded-lg placeholder:text-zinc-500"
                {...register('note')}
              />
            </div>

            {/* Account, Currency & Amount Row */}
            <div className="w-full flex justify-between items-center px-1 mt-1 gap-2">
              {(type === 'expense' || type === 'income') && (
                <div className="flex-[0.35] min-w-[80px]">
                  <Select value={selectedAccountId ?? undefined} onValueChange={(val) => setValue('accountId', val ?? undefined)}>
                    <SelectTrigger className="w-full h-auto px-2 py-1 border-none bg-transparent hover:bg-white/10 text-zinc-400 hover:text-white shadow-none text-xl font-medium focus:ring-0 rounded cursor-pointer transition-colors">
                      <SelectValue placeholder={t('add.account')}>
                        {selectedAccountId ? accounts?.find(a => a.id === selectedAccountId)?.name : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end gap-1 flex-1 overflow-hidden justify-end">
                <span className="text-xl font-medium text-zinc-400 pb-1">{selectedCurrency}</span>
                <div className="overflow-hidden whitespace-nowrap text-4xl sm:text-5xl font-mono font-bold tracking-tighter text-right text-white pr-1">
                  {displayAmount || '0'}
                </div>
              </div>
            </div>
            {errors.accountId && type !== 'transfer' && <p className="text-xs font-medium text-destructive px-2 mt-[-8px]">{errors.accountId.message}</p>}
            
            {errors.amount && <p className="text-sm font-medium text-destructive text-right px-2">{errors.amount.message}</p>}

            {/* Exchange Rate Info Area */}
            {selectedCurrency !== baseCurrency && (
              <div className="w-full p-3 border border-white/10 rounded-xl bg-white/5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Exchange Rate</span>
                  <Input 
                    type="number" 
                    className="w-24 h-6 text-right font-mono text-sm px-1 bg-transparent border-white/10 text-white" 
                    value={customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency).toFixed(4)}
                    onChange={(e) => setCustomExchangeRate(parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Base Amount ({baseCurrency})</span>
                  <span className="font-mono font-medium text-white">
                    {((parseFloat(displayAmount) || 0) * (customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            <NumericKeypad 
              value={displayAmount} 
              onChange={setDisplayAmount} 
              onSubmit={handleKeypadSubmit} 
              date={selectedDate}
              onDateChange={(val) => setValue('date', val)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
