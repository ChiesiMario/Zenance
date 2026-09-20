import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, ArrowRight, ArrowRightLeft, Wallet, Zap } from 'lucide-react';
import { cn, getCurrencySymbol, formatDisplayAmount } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useBudgets } from '@/hooks/useBudgets';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumericKeypad } from './NumericKeypad';
import type { SplitItem } from './SplitAdvanceDialog';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'expense' | 'income' | 'transfer' | 'loan';
  initialLoanType?: 'borrow' | 'lend';
  transactionToEditId?: string | null;
  initialContactId?: string | null;
}

export function AddTransactionModal({ isOpen, onClose, initialType = 'expense', initialLoanType = 'borrow', transactionToEditId, initialContactId }: Props) {
  const { t } = useTranslation();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { categories, addCategory } = useCategories();
  const [splits, setSplits] = useState<SplitItem[]>([]);
  const { wallets: accounts, contacts } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { budgets } = useBudgets();
  const { getRate } = useExchangeRates();
  
  const walletCount = accounts?.length ?? 0;
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const [type, setType] = useState<'expense' | 'income' | 'transfer' | 'loan'>(initialType);
  const [loanType, setLoanType] = useState<'borrow' | 'lend'>(initialLoanType);
  const [newCatName, setNewCatName] = useState('');
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [customExchangeRate, setCustomExchangeRate] = useState<number | null>(null);
  const [isFeeDialogOpen, setIsFeeDialogOpen] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [displayAmount, setDisplayAmount] = useState('');
  const [displayInAmount, setDisplayInAmount] = useState('');
  const [focusedAmount, setFocusedAmount] = useState<'out' | 'in'>('out');
  const [isLinked, setIsLinked] = useState(true);

  const formSchema = z.object({
    amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
    categoryId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.categoryRequired')),
    accountId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.accountRequired')),
    fromAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    toAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    transferInAmount: z.number().nonnegative(t('add.errors.amountPositive')).optional(),
    feeCategoryId: z.string().optional(),
    budgetId: z.string().optional(),
    reimbursementContactId: z.string().optional(),
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
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '' as unknown as number,
      categoryId: '',
      accountId: '',
      fromAccountId: '',
      toAccountId: '',
      transferInAmount: undefined,
      feeCategoryId: undefined,
      budgetId: initialType === 'income' ? 'none' : 'auto',
      reimbursementContactId: initialContactId || undefined,
      date: new Date().toISOString().split('T')[0],
      note: '',
    },
  });

  const transactionToEdit = useMemo(() => {
    if (!transactionToEditId || !transactions) return null;
    return transactions.find(t => t.id === transactionToEditId) || null;
  }, [transactionToEditId, transactions]);

  useEffect(() => {
    if (isOpen) {
      if (transactionToEdit) {
        // Edit mode
        if (transactionToEdit.splitGroupId) {
          const groupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId) || [];
          const loadedSplits: SplitItem[] = groupTxs
            .filter(t => t.type === 'loan' && t.toAccountId && t.reimbursementStatus)
            .map(t => ({ contactId: t.toAccountId!, amount: t.originalAmount }));
          setSplits(loadedSplits);
          const totalGroupOriginalAmount = groupTxs.reduce((sum, t) => sum + t.originalAmount, 0);
          setDisplayAmount(totalGroupOriginalAmount.toString());
        } else if (transactionToEdit.reimbursementContactId) {
          setSplits([{ contactId: transactionToEdit.reimbursementContactId, amount: transactionToEdit.originalAmount }]);
        } else {
          setSplits([]);
        }

        const isAdvanceLoan = transactionToEdit.type === 'loan' && !!transactionToEdit.reimbursementContactId;
        if (isAdvanceLoan) {
          setType('expense');
        } else {
          setType(transactionToEdit.type);
        }
        const isLend = transactionToEdit.type === 'loan' && contacts?.some(c => c.id === transactionToEdit.toAccountId);
        setLoanType(isLend ? 'lend' : 'borrow');
        
        // Handle currencies
        const originalCurrency = transactionToEdit.originalCurrency;
        if (originalCurrency !== baseCurrency) {
          setCustomExchangeRate(transactionToEdit.exchangeRate);
        } else {
          setCustomExchangeRate(null);
        }

        // Set amount display correctly if not already set by splitGroup
        if (!transactionToEdit.splitGroupId) {
          setDisplayAmount(transactionToEdit.originalAmount.toString());
        }
        
        // If transfer, handle transferInAmount
        if (transactionToEdit.type === 'transfer' && transactionToEdit.transferInAmount !== undefined) {
          setDisplayInAmount(transactionToEdit.transferInAmount.toString());
          setIsLinked(false);
        } else {
          setDisplayInAmount('');
          setIsLinked(true);
        }

        reset({
          amount: transactionToEdit.originalAmount,
          categoryId: transactionToEdit.category,
          accountId: transactionToEdit.accountId,
          fromAccountId: !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan') ? transactionToEdit.accountId : undefined,
          toAccountId: !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan') ? transactionToEdit.toAccountId || undefined : undefined,
          transferInAmount: transactionToEdit.transferInAmount,
          budgetId: transactionToEdit.budgetId || (transactionToEdit.type === 'income' ? 'none' : 'auto'),
          reimbursementContactId: transactionToEdit.reimbursementContactId,
          date: transactionToEdit.date,
          note: transactionToEdit.note || '',
        });
        setFocusedAmount('out');
      } else {
        // Add mode
        setType(initialType);
        reset();
        setSplits(initialContactId ? [{ contactId: initialContactId, amount: 0 }] : []);
        setValue('budgetId', initialType === 'income' ? 'none' : 'auto');
        setValue('reimbursementContactId', initialContactId || undefined);
        setDisplayAmount('');
        setDisplayInAmount('');
        setFocusedAmount('out');
        setIsLinked(true);
        setValue('feeCategoryId', undefined);
        setLoanType(initialLoanType);
      }
    }
  }, [isOpen, initialType, initialLoanType, initialContactId, transactionToEdit, transactions, baseCurrency, contacts, reset, setValue]);

  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer' | 'loan', newLoanType?: 'borrow' | 'lend') => {
    if (newType === type && (!newLoanType || newLoanType === loanType)) return;
    setType(newType);
    reset();
    setValue('budgetId', newType === 'income' ? 'none' : 'auto');
    setValue('reimbursementContactId', undefined);
    setDisplayAmount('');
    setDisplayInAmount('');
    setFocusedAmount('out');
    setIsLinked(true);
    setValue('feeCategoryId', undefined);
    setLoanType(newLoanType || 'borrow');
  };

  const toggleLoanType = () => {
    const nextLoanType = loanType === 'lend' ? 'borrow' : 'lend';
    setLoanType(nextLoanType);
    const currentFrom = watch('fromAccountId');
    const currentTo = watch('toAccountId');
    if (currentFrom && currentTo) {
      setValue('fromAccountId', currentTo);
      setValue('toAccountId', currentFrom);
    }
  };

  const selectedCategoryId = watch('categoryId');
  const selectedAccountId = watch('accountId');
  const selectedFromAccountId = watch('fromAccountId');
  const selectedToAccountId = watch('toAccountId');
  const selectedDate = watch('date');
  
  const selectedAccount = useMemo(() => accounts?.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);
  const selectedFromAccount = useMemo(() => accounts?.find(a => a.id === selectedFromAccountId), [accounts, selectedFromAccountId]);
  
  const loanWallet = useMemo(() => {
    if (type !== 'loan') return null;
    const walletId = loanType === 'lend' ? selectedFromAccountId : selectedToAccountId;
    return accounts?.find(a => a.id === walletId);
  }, [type, loanType, selectedFromAccountId, selectedToAccountId, accounts]);

  const loanContact = useMemo(() => {
    if (type !== 'loan') return null;
    const contactId = loanType === 'lend' ? selectedToAccountId : selectedFromAccountId;
    return contacts?.find(c => c.id === contactId) || null;
  }, [type, loanType, selectedFromAccountId, selectedToAccountId, contacts]);

  const handleConfirmFee = () => {
    const feeVal = parseFloat(feeInput) || 0;
    if (feeVal > 0) {
      const parsed = parseFloat(displayAmount) || 0;
      setDisplayInAmount(Math.max(0, parsed - feeVal).toString());
      setIsLinked(false);
      if (!watch('feeCategoryId')) {
        const feeCat = categories?.find(c => c.type === 'expense' && (c.name.includes('手續費') || c.name.includes('手续费') || c.name.toLowerCase().includes('fee'))) || categories?.find(c => c.type === 'expense');
        if (feeCat) {
          setValue('feeCategoryId', feeCat.id);
        }
      }
    } else {
      setDisplayInAmount(displayAmount);
      setIsLinked(true);
      setValue('feeCategoryId', undefined);
    }
    setIsFeeDialogOpen(false);
  };

  const selectedCurrency = type === 'transfer'
    ? (selectedFromAccount?.currency || baseCurrency)
    : type === 'loan'
    ? (loanWallet?.currency || baseCurrency)
    : (selectedAccount?.currency || baseCurrency);
  
  const selectedToCurrency = (type === 'transfer' || type === 'loan')
    ? (accounts?.find(a => a.id === selectedToAccountId)?.currency || baseCurrency)
    : baseCurrency;
  
  useEffect(() => {
    setCustomExchangeRate(null);
  }, [selectedCurrency]);

  const filteredCategories = useMemo(() => categories?.filter(c => c.type === type) || [], [categories, type]);
  
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

  const parsedAmount = parseFloat(displayAmount) || 0;
  const parsedInAmount = parseFloat(displayInAmount);
  const diffAmount = (type === 'transfer' && selectedCurrency === selectedToCurrency && !isNaN(parsedInAmount) && parsedInAmount > 0) 
    ? parsedAmount - parsedInAmount 
    : 0;

  const frequentCategories = useMemo(() => {
    return [...filteredCategories].sort((a, b) => {
      const totalA = categoryMonthlyTotals[a.id] || 0;
      const totalB = categoryMonthlyTotals[b.id] || 0;
      return totalB - totalA;
    });
  }, [filteredCategories, categoryMonthlyTotals]);

  const displayedPills = useMemo(() => {
    const top = frequentCategories.slice(0, 6);
    if (selectedCategoryId && !top.some(c => c.id === selectedCategoryId)) {
      const activeCat = filteredCategories.find(c => c.id === selectedCategoryId);
      if (activeCat) {
        return [activeCat, ...top.slice(0, 5)];
      }
    }
    return top;
  }, [frequentCategories, selectedCategoryId, filteredCategories]);

  const handleSwapTransferAccounts = () => {
    const currentFrom = watch('fromAccountId');
    const currentTo = watch('toAccountId');
    if (currentFrom && currentTo) {
      setValue('fromAccountId', currentTo);
      setValue('toAccountId', currentFrom);
    }
  };



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
      const defaultContact = initialContactId 
        ? (contacts.find(c => c.id === initialContactId) || contacts[0]) 
        : contacts[0];
        
      if (loanType === 'borrow') {
        setValue('fromAccountId', defaultContact.id);
        setValue('toAccountId', defaultWallet.id);
      } else {
        setValue('fromAccountId', defaultWallet.id);
        setValue('toAccountId', defaultContact.id);
      }
    }
  }, [type, loanType, accounts, contacts, setValue, initialContactId]);

  const onSubmit = async (data: FormValues) => {
    const isSameCurrency = selectedCurrency === selectedToCurrency;
    const transferIn = data.transferInAmount;
    const diff = (type === 'transfer' && isSameCurrency && transferIn !== undefined) ? data.amount - transferIn : 0;
    
    if (diff !== 0 && !data.feeCategoryId) {
      setError('feeCategoryId', { type: 'manual', message: t('add.errors.categoryRequired', 'Category is required') });
      return;
    }

    const exchangeRate = customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency);

    if (type === 'transfer' && isSameCurrency && diff !== 0) {
      // Split transaction
      const transferActualAmount = diff > 0 ? transferIn! : data.amount;
      
      // Transaction 1: Transfer
      await addTransaction({
        originalAmount: transferActualAmount,
        originalCurrency: selectedCurrency,
        exchangeRate: exchangeRate,
        amount: transferActualAmount * exchangeRate,
        type: 'transfer',
        category: 'transfer',
        accountId: data.fromAccountId!,
        toAccountId: data.toAccountId,
        note: data.note,
        date: data.date,
      });

      // Transaction 2: Fee/Interest
      const feeAmount = Math.abs(diff);
      
      if (transactionToEdit) {
        // For simplicity, in MVP we don't handle editing multi-currency fees properly.
        // It's a complex edge case for a basic edit mode.
        // We'll just update the main transaction.
      } else {
        await addTransaction({
          originalAmount: feeAmount,
          originalCurrency: selectedCurrency,
          exchangeRate: exchangeRate,
          amount: feeAmount * exchangeRate,
          type: diff > 0 ? 'expense' : 'income',
          category: data.feeCategoryId!,
          accountId: diff > 0 ? data.fromAccountId! : data.toAccountId!,
          note: data.note ? `${data.note} (${diff > 0 ? 'Fee' : 'Interest'})` : t(diff > 0 ? 'add.transferFee' : 'add.transferInterest', diff > 0 ? 'Transfer Fee' : 'Transfer Interest'),
          date: data.date,
        });
      }
      
      onClose();
      return;
    }

    const calculatedBaseAmount = data.amount * exchangeRate;
    const hasSplits = type === 'expense' && splits.length > 0;
    const isAdvance = type === 'expense' && (hasSplits || !!data.reimbursementContactId);

    // 多人分攤或部分代付分拆處理
    if (type === 'expense' && splits.length > 0) {
      const totalAdvanceOriginal = splits.reduce((sum, s) => sum + s.amount, 0);
      const selfExpenseOriginal = Math.max(0, Math.round((data.amount - totalAdvanceOriginal) * 100) / 100);
      const isMultiOrPartial = splits.length > 1 || (splits.length === 1 && selfExpenseOriginal > 0);

      if (isMultiOrPartial) {
        const splitGroupId = transactionToEdit?.splitGroupId || uuidv4();

        // 若為編輯模式，清除舊群組所有交易
        if (transactionToEdit) {
          if (transactionToEdit.splitGroupId) {
            const oldGroupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId) || [];
            for (const oldTx of oldGroupTxs) {
              await deleteTransaction(oldTx.id);
            }
          } else {
            await deleteTransaction(transactionToEdit.id);
          }
        }

        // 1. 若有自己的自費支出，建立支出交易
        if (selfExpenseOriginal > 0) {
          const selfBaseAmount = selfExpenseOriginal * exchangeRate;
          await addTransaction({
            originalAmount: selfExpenseOriginal,
            originalCurrency: selectedCurrency,
            exchangeRate: exchangeRate,
            amount: selfBaseAmount,
            type: 'expense',
            category: data.categoryId!,
            accountId: data.accountId!,
            budgetId: data.budgetId,
            splitGroupId,
            note: data.note,
            date: data.date,
          });
        }

        // 2. 為每位代付對象建立借貸代付交易 (type: 'loan'，分類為代付)
        for (const s of splits) {
          const advBaseAmount = s.amount * exchangeRate;
          await addTransaction({
            originalAmount: s.amount,
            originalCurrency: selectedCurrency,
            exchangeRate: exchangeRate,
            amount: advBaseAmount,
            type: 'loan',
            category: 'advance', // 分類為「代付」
            accountId: data.accountId!, // 付款錢包扣款
            toAccountId: s.contactId,   // 借給代付對象（應收債權）
            reimbursementContactId: s.contactId,
            reimbursementStatus: 'pending',
            splitGroupId,
            note: data.note,
            date: data.date,
          });
        }

        onClose();
        return;
      }
    }

    const effectiveType = isAdvance ? 'loan' : type;
    const singleContactId = splits.length === 1 ? splits[0].contactId : data.reimbursementContactId;
    
    const txData = {
      originalAmount: data.amount,
      originalCurrency: selectedCurrency,
      exchangeRate: exchangeRate,
      amount: calculatedBaseAmount,
      type: effectiveType,
      category: isAdvance 
        ? 'advance' 
        : ((type === 'transfer' || type === 'loan') ? (type === 'loan' ? 'loan' : 'transfer') : data.categoryId!),
      accountId: isAdvance 
        ? data.accountId! 
        : ((type === 'transfer' || type === 'loan') ? data.fromAccountId! : data.accountId!),
      toAccountId: isAdvance 
        ? singleContactId 
        : ((type === 'transfer' || type === 'loan') ? data.toAccountId : undefined),
      transferInAmount: !isAdvance && (type === 'transfer' || type === 'loan') && data.transferInAmount !== undefined ? data.transferInAmount : undefined,
      budgetId: isAdvance ? undefined : ((type === 'expense' || type === 'income') ? data.budgetId : undefined),
      reimbursementStatus: isAdvance
        ? (transactionToEdit?.reimbursementStatus || 'pending')
        : (type === 'expense' && singleContactId
          ? (transactionToEdit?.reimbursementStatus || 'pending')
          : undefined),
      reimbursementContactId: isAdvance
        ? singleContactId
        : (type === 'expense' ? singleContactId : undefined),
      note: data.note,
      date: data.date,
    };

    if (transactionToEdit) {
      if (transactionToEdit.splitGroupId) {
        const otherGroupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id) || [];
        for (const otherTx of otherGroupTxs) {
          await deleteTransaction(otherTx.id);
        }
      }
      await updateTransaction(transactionToEdit.id, {
        ...txData,
        splitGroupId: undefined,
      });
    } else {
      await addTransaction(txData);
    }
    
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
    
    if (type === 'transfer') {
      const inVal = parseFloat(displayInAmount);
      if (!isNaN(inVal) && inVal > 0) {
        setValue('transferInAmount', inVal);
      } else if (selectedCurrency === selectedToCurrency) {
        setValue('transferInAmount', val);
      } else {
        setValue('transferInAmount', undefined);
      }
    }
    
    handleSubmit(onSubmit)();
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open, details) => {
        if (!open) {
          if (details?.reason === 'outside-press') {
            return; // Prevent outside click from closing
          }
          onClose();
        }
      }} 
      disablePointerDismissal={true}
      modal="trap-focus"
    >
      <DialogContent
        commandDeck
        showCloseButton={false}
        className="gap-3 sm:gap-3.5 flex flex-col justify-between select-none"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{transactionToEditId ? t('dashboard.edit', '編輯') : t('nav.add')}</DialogTitle>
        </DialogHeader>

        {/* 1. Top Bar: Segmented Control & Close Button */}
        <div className="w-full flex items-center justify-between gap-2 shrink-0">
          <div className="flex-1 bg-muted/80 border border-border p-1 rounded-full flex items-center justify-between text-xs font-medium">
            <button 
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={cn(
                "flex-1 py-1 rounded-full text-center transition-all cursor-pointer",
                type === 'expense' ? "bg-primary text-primary-foreground font-semibold shadow-none" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('add.expense')}
            </button>
            <button 
              type="button"
              onClick={() => handleTypeChange('income')}
              className={cn(
                "flex-1 py-1 rounded-full text-center transition-all cursor-pointer",
                type === 'income' ? "bg-primary text-primary-foreground font-semibold shadow-none" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('add.income')}
            </button>
            <button 
              type="button"
              onClick={() => {
                if (walletCount < 2) {
                  toast.show(t('alerts.transferNeedsTwoAccounts'));
                  return;
                }
                handleTypeChange('transfer');
              }}
              className={cn(
                "flex-1 py-1 rounded-full text-center transition-all cursor-pointer",
                walletCount < 2 && type !== 'transfer' && "opacity-40 cursor-not-allowed",
                type === 'transfer' ? "bg-primary text-primary-foreground font-semibold shadow-none" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('add.transfer')}
            </button>
            <button 
              type="button"
              onClick={() => handleTypeChange('loan', 'lend')}
              className={cn(
                "flex-1 py-1 rounded-full text-center transition-all cursor-pointer",
                type === 'loan' && loanType === 'lend' ? "bg-primary text-primary-foreground font-semibold shadow-none" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('add.lend')}
            </button>
            <button 
              type="button"
              onClick={() => handleTypeChange('loan', 'borrow')}
              className={cn(
                "flex-1 py-1 rounded-full text-center transition-all cursor-pointer",
                type === 'loan' && loanType === 'borrow' ? "bg-primary text-primary-foreground font-semibold shadow-none" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('add.borrow')}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Hero Section: Account Badge / Flow Bar + Monospace Amount */}
        <div className="w-full flex flex-col items-center justify-center py-1">
          {/* Account Badge for Expense / Income */}
          {(type === 'expense' || type === 'income') && (
            <div className="mb-1.5 flex justify-center">
              <Select value={selectedAccountId ?? undefined} onValueChange={(val) => setValue('accountId', val ?? undefined)}>
                <SelectTrigger className="h-7 px-3 py-0 rounded-full bg-muted/80 border border-border text-xs text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center gap-1.5 w-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <SelectValue placeholder={t('add.account')}>
                    {selectedAccountId ? accounts?.find(a => a.id === selectedAccountId)?.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border text-popover-foreground">
                  {accounts?.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dual-Node Flow Deck for Transfer */}
          {type === 'transfer' && (
            <div className="w-full rounded-2xl bg-muted/40 border border-border p-2.5 flex items-center justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                  {t('add.fromAccount', '轉出帳戶')}
                </span>
                <Select value={selectedFromAccountId || undefined} onValueChange={(val) => setValue('fromAccountId', val as string)}>
                  <SelectTrigger className="w-full h-11 px-2.5 py-1 bg-card border-border text-foreground hover:bg-muted/50 rounded-2xl text-xs font-semibold cursor-pointer justify-start shadow-none">
                    <div className="flex items-center justify-start gap-2 min-w-0 pl-1">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Wallet className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col items-start text-left min-w-0">
                        <span className="text-xs font-semibold truncate max-w-[85px]">
                          {accounts?.find(a => a.id === selectedFromAccountId)?.name || t('add.account')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {selectedCurrency}
                        </span>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground">
                    {accounts?.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} disabled={selectedToAccountId === acc.id}>
                        {acc.name} ({acc.currency || baseCurrency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative shrink-0 flex items-center justify-center pt-3.5">
                <button
                  type="button"
                  onClick={handleSwapTransferAccounts}
                  className="w-8 h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
                  title={t('add.swapAccounts', '對調帳戶')}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                  {t('add.toAccount', '轉入帳戶')}
                </span>
                <Select value={selectedToAccountId || undefined} onValueChange={(val) => setValue('toAccountId', val as string)}>
                  <SelectTrigger className="w-full h-11 px-2.5 py-1 bg-card border-border text-foreground hover:bg-muted/50 rounded-2xl text-xs font-semibold cursor-pointer justify-end shadow-none">
                    <div className="flex items-center justify-end gap-2 min-w-0 pr-1">
                      <div className="flex flex-col items-end text-right min-w-0">
                        <span className="text-xs font-semibold truncate max-w-[85px]">
                          {accounts?.find(a => a.id === selectedToAccountId)?.name || t('add.account')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {selectedToCurrency}
                        </span>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Wallet className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground">
                    {accounts?.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} disabled={selectedFromAccountId === acc.id}>
                        {acc.name} ({acc.currency || baseCurrency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Dual-Node Flow Deck for Loan (Lend / Borrow) */}
          {type === 'loan' && (
            <div className="w-full rounded-2xl bg-muted/40 border border-border p-2.5 flex items-center justify-between gap-2 mb-2">
              
              {/* Left Node: Wallet (if lend) OR Contact Avatar (if borrow) */}
              <div className="flex-1 min-w-0">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                  {loanType === 'lend' ? t('add.fromWallet', '出款錢包') : t('add.lender', '借款來源')}
                </span>
                <Select
                  value={selectedFromAccountId || undefined}
                  onValueChange={(val) => setValue('fromAccountId', val as string)}
                >
                  <SelectTrigger className="w-full h-11 px-2.5 py-1 bg-card border-border text-foreground hover:bg-muted/50 rounded-2xl text-xs font-semibold cursor-pointer justify-start shadow-none">
                    <div className="flex items-center justify-start gap-2 min-w-0 pl-1">
                      {loanType === 'lend' ? (
                        <>
                          <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Wallet className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col items-start text-left min-w-0">
                            <span className="text-xs font-semibold truncate max-w-[85px]">
                              {accounts?.find(a => a.id === selectedFromAccountId)?.name || t('add.account')}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {selectedCurrency}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-7 h-7 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0 select-none">
                            {loanContact?.name ? loanContact.name.trim().charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="flex flex-col items-start text-left min-w-0">
                            <span className="text-xs font-semibold truncate max-w-[85px]">
                              {loanContact?.name || t('add.contact')}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {loanContact?.group === 'organization' ? t('contacts.groupOrganization', '機構') : t('contacts.groupPersonal', '個人')}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground">
                    {(loanType === 'lend' ? accounts : contacts)?.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} disabled={selectedToAccountId === acc.id} className="py-2 cursor-pointer">
                        {loanType === 'lend' ? (
                          <span>{acc.name} ({acc.currency || baseCurrency})</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
                              {acc.name ? acc.name.trim().charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-semibold">{acc.name}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {acc.group === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                              </span>
                            </div>
                          </div>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Center Interchange Anchor */}
              <div className="relative shrink-0 flex items-center justify-center pt-3.5">
                <button
                  type="button"
                  onClick={toggleLoanType}
                  className="w-8 h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
                  title={loanType === 'lend' ? t('add.lend') : t('add.borrow')}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Right Node: Contact Avatar (if lend) OR Wallet (if borrow) */}
              <div className="flex-1 min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                  {loanType === 'lend' ? t('add.borrower', '借款對象') : t('add.toWallet', '入款錢包')}
                </span>
                <Select
                  value={selectedToAccountId || undefined}
                  onValueChange={(val) => setValue('toAccountId', val as string)}
                >
                  <SelectTrigger className="w-full h-11 px-2.5 py-1 bg-card border-border text-foreground hover:bg-muted/50 rounded-2xl text-xs font-semibold cursor-pointer justify-end shadow-none">
                    <div className="flex items-center justify-end gap-2 min-w-0 pr-1">
                      {loanType === 'lend' ? (
                        <>
                          <div className="flex flex-col items-end text-right min-w-0">
                            <span className="text-xs font-semibold truncate max-w-[85px]">
                              {loanContact?.name || t('add.contact')}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {loanContact?.group === 'organization' ? t('contacts.groupOrganization', '機構') : t('contacts.groupPersonal', '個人')}
                            </span>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 select-none">
                            {loanContact?.name ? loanContact.name.trim().charAt(0).toUpperCase() : '?'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col items-end text-right min-w-0">
                            <span className="text-xs font-semibold truncate max-w-[85px]">
                              {accounts?.find(a => a.id === selectedToAccountId)?.name || t('add.account')}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {selectedToCurrency}
                            </span>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <Wallet className="w-3.5 h-3.5" />
                          </div>
                        </>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground">
                    {(loanType === 'lend' ? contacts : accounts)?.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} disabled={selectedFromAccountId === acc.id} className="py-2 cursor-pointer">
                        {loanType === 'lend' ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              {acc.name ? acc.name.trim().charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-semibold">{acc.name}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {acc.group === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span>{acc.name} ({acc.currency || baseCurrency})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          )}

          {/* Massive Monospace Amount Display */}
          <div className="flex items-baseline justify-center gap-1.5 w-full py-1">
            <span className="text-xl font-medium text-muted-foreground tracking-tight">{selectedCurrency}</span>
            <span className="font-mono text-5xl font-bold tracking-tighter text-foreground select-none">
              {formatDisplayAmount(displayAmount)}
            </span>
          </div>

          {errors.amount && <p className="text-xs font-medium text-destructive mt-1">{errors.amount.message}</p>}
          {errors.accountId && (type !== 'transfer' && type !== 'loan') && <p className="text-xs font-medium text-destructive mt-1">{errors.accountId.message}</p>}

          {/* Transfer Fee & Multi-currency Info Pills */}
          {type === 'transfer' && (
            <div className="mt-1 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFeeInput(diffAmount > 0 ? diffAmount.toString() : '');
                  setIsFeeDialogOpen(true);
                }}
                className="px-2.5 py-1 rounded-full bg-muted/80 border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span>{t('add.fee', '手續費')}：</span>
                <span className="font-mono font-semibold text-foreground">
                  {diffAmount > 0 ? `${diffAmount.toLocaleString()} ${selectedCurrency}` : t('add.noFee', '無手續費')}
                </span>
                <span className="text-[9px] opacity-60">▾</span>
              </button>

              {selectedCurrency !== selectedToCurrency && (
                <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                  <span>1 {selectedCurrency} ≈ {getRate(selectedCurrency, selectedToCurrency).toFixed(4)} {selectedToCurrency}</span>
                </div>
              )}
            </div>
          )}

          {/* Loan Direction Status Pill */}
          {type === 'loan' && (
            <div className="mt-1 flex items-center justify-center gap-2">
              <div className="px-2.5 py-1 rounded-full bg-muted/80 border border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", loanType === 'lend' ? "bg-amber-500" : "bg-purple-500")} />
                <span>{loanType === 'lend' ? t('add.loanTypeLendDesc', '借出待收回') : t('add.loanTypeBorrowDesc', '借入待歸還')}</span>
              </div>
            </div>
          )}

          {/* Multi-currency Exchange Rate Info */}
          {selectedCurrency !== baseCurrency && (
            <div className="w-full mt-2 p-2 border border-border rounded-xl bg-muted/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">1 {selectedCurrency} =</span>
              <Input 
                type="number" 
                className="w-20 h-6 text-right font-mono text-xs px-1 bg-transparent border-border text-foreground" 
                value={customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency).toFixed(4)}
                onChange={(e) => setCustomExchangeRate(parseFloat(e.target.value) || 1)}
              />
              <span className="text-muted-foreground text-[11px]">{baseCurrency}</span>
              <span className="font-mono text-foreground ml-2">
                ≈ {((parseFloat(displayAmount) || 0) * (customExchangeRate !== null ? customExchangeRate : getRate(selectedCurrency, baseCurrency))).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseCurrency}
              </span>
            </div>
          )}
        </div>

        {/* 3. Mid Section: Category Chips & Note Input */}
        <div className="w-full flex flex-col gap-2">
          {/* Category Pills (for expense / income) */}
          {(type === 'expense' || type === 'income') && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full">
              {displayedPills.map(cat => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setValue('categoryId', cat.id)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold shadow-none"
                        : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    {cat.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCatPickerOpen(true)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 shrink-0 transition-all cursor-pointer flex items-center gap-1"
                title={t('add.moreCategories', '更多分類')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px]">{t('common.more', '更多')}</span>
              </button>
            </div>
          )}

          {errors.categoryId && <p className="text-xs font-medium text-destructive">{errors.categoryId.message}</p>}

          {/* Inline Note Input */}
          <div className="w-full">
            <input 
              id="note" 
              type="text" 
              placeholder={t('add.note', '填寫備註...')} 
              value={watch('note') || ''} 
              onChange={(e) => setValue('note', e.target.value, { shouldDirty: true })} 
              className="w-full h-8 px-3 rounded-xl bg-muted/60 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 transition-colors" 
            />
          </div>
        </div>

        {/* 4. Bottom Section: Integrated Keypad */}
        <div className="w-full pt-1">
          <NumericKeypad 
            value={type === 'transfer' && focusedAmount === 'in' ? displayInAmount : displayAmount} 
            onChange={(val) => {
              if (type === 'transfer') {
                if (focusedAmount === 'in') {
                  setDisplayInAmount(val);
                  setIsLinked(false);
                } else {
                  setDisplayAmount(val);
                  if (isLinked && selectedCurrency === selectedToCurrency) {
                    setDisplayInAmount(val);
                  }
                }
              } else {
                setDisplayAmount(val);
              }
            }} 
            onSubmit={handleKeypadSubmit} 
            date={selectedDate}
            onDateChange={(val) => setValue('date', val)}
            type={type}
            budgetId={watch('budgetId')}
            onBudgetChange={(bId) => setValue('budgetId', bId)}
            budgets={budgets}
            splits={splits}
            onSplitsChange={(newSplits) => {
              setSplits(newSplits);
              setValue('reimbursementContactId', newSplits.length === 1 ? newSplits[0].contactId : undefined);
            }}
            currencySymbol={getCurrencySymbol(selectedCurrency)}
            reimbursementContactId={splits.length === 1 ? splits[0].contactId : undefined}
            onReimbursementContactChange={(cId) => {
              setValue('reimbursementContactId', cId);
            }}
            contacts={contacts}
            onFeeClick={() => {
              setFeeInput(diffAmount > 0 ? diffAmount.toString() : '');
              setIsFeeDialogOpen(true);
            }}
            feeAmount={diffAmount}
            loanContactName={loanContact?.name}
            onLoanContactSelect={(cId) => {
              if (loanType === 'lend') {
                setValue('toAccountId', cId);
              } else {
                setValue('fromAccountId', cId);
              }
            }}
          />
        </div>

        {/* Full Category Picker Dialog */}
        <Dialog open={isCatPickerOpen} onOpenChange={setIsCatPickerOpen}>
          <DialogContent className="sm:max-w-[380px] bg-card border border-border text-card-foreground p-4">
            <DialogHeader>
              <DialogTitle className="text-card-foreground text-base font-semibold">
                {type === 'expense' ? t('add.expenseCategories', '支出分類') : t('add.incomeCategories', '收入分類')}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto no-scrollbar py-2">
              {filteredCategories.map(cat => {
                const isSelected = selectedCategoryId === cat.id;
                const total = categoryMonthlyTotals[cat.id] || 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setValue('categoryId', cat.id);
                      setIsCatPickerOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 h-14 p-1.5 rounded-xl border text-center transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : "bg-muted/60 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    <span className="text-xs truncate w-full">{cat.name}</span>
                    <span className="text-[9px] font-mono opacity-60 truncate">
                      {total > 0 ? `${currencySymbol}${compactFormatter.format(total)}` : '-'}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setIsCatPickerOpen(false);
                  setIsCatDialogOpen(true);
                }}
                className="flex flex-col items-center justify-center gap-1 h-14 p-1.5 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px]">{t('add.addCategory')}</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Custom Category Dialog */}
        <Dialog open={isCatDialogOpen} onOpenChange={setIsCatDialogOpen}>
          <DialogContent className="sm:max-w-[320px] bg-card border border-border text-card-foreground p-4">
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
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <DialogFooter className="flex gap-2">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => setIsCatDialogOpen(false)}
                className="border-border text-foreground hover:bg-muted"
              >
                {t('add.cancel')}
              </Button>
              <Button 
                type="button" 
                onClick={handleAddCategory} 
                disabled={!newCatName.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('add.addCategory')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Fee Settings Dialog */}
        <Dialog open={isFeeDialogOpen} onOpenChange={setIsFeeDialogOpen}>
          <DialogContent className="sm:max-w-[340px] bg-card border border-border text-card-foreground p-4">
            <DialogHeader>
              <DialogTitle className="text-card-foreground text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>{t('add.feeSetting', '手續費設定')}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t('add.fee', '手續費')} ({selectedCurrency})
                </label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmFee()}
                  className="bg-muted/60 border-border text-foreground font-mono"
                  autoFocus
                />
              </div>

              {categories && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t('add.category', '分類')}
                  </label>
                  <Select
                    value={watch('feeCategoryId') || ''}
                    onValueChange={(val) => setValue('feeCategoryId', val || undefined)}
                  >
                    <SelectTrigger className="w-full bg-muted/60 border-border text-foreground text-xs">
                      <SelectValue placeholder={t('add.category', '分類')} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border text-popover-foreground max-h-48">
                      {categories.filter(c => c.type === 'expense').map(cat => (
                        <SelectItem key={cat.id} value={cat.id} className="text-xs cursor-pointer">
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsFeeDialogOpen(false)}
                className="border-border text-foreground hover:bg-muted"
              >
                {t('common.cancel', '取消')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmFee}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('common.confirm', '確認')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
