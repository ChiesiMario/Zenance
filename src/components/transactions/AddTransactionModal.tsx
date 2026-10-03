import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, ArrowRight, ArrowRightLeft, Zap, Gift, Sparkles } from 'lucide-react';
import { cn, getCurrencySymbol, formatDisplayAmount, formatAmountNumber, isBalanceAdjustmentTx, getLocalDateString } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { predictCategoryFromNote } from '@/lib/categoryPredictor';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useBudgets } from '@/hooks/useBudgets';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { NumericKeypad } from './NumericKeypad';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { AccountSelectDialog } from '@/components/accounts/AccountSelectDialog';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { db, type Account } from '@/services/db/db';
import type { SplitItem } from './SplitAdvanceDialog';
import { v4 as uuidv4 } from 'uuid';

const roundToTwo = (val: number): number => Math.round(val * 100) / 100;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'expense' | 'income' | 'transfer' | 'loan';
  initialLoanType?: 'borrow' | 'lend';
  transactionToEditId?: string | null;
  initialContactId?: string | null;
  initialToAccountId?: string | null;
  initialAmount?: number | null;
  initialAccountId?: string | null;
  initialCategoryId?: string | null;
  initialNote?: string | null;
}

export function AddTransactionModal({ 
  isOpen, 
  onClose, 
  initialType = 'expense', 
  initialLoanType = 'borrow', 
  transactionToEditId, 
  initialContactId,
  initialToAccountId,
  initialAmount,
  initialAccountId,
  initialCategoryId,
  initialNote,
}: Props) {
  const { t } = useTranslation();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { categories, allCategories, addCategory } = useCategories();
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
  const [isGift, setIsGift] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [displayAmountIn, setDisplayAmountIn] = useState('');
  const [displayFeeAmount, setDisplayFeeAmount] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<number | null>(null);

  const notifyTyping = () => {
    setIsTyping(true);
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
      typingTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const [focusedField, setFocusedField] = useState<'out' | 'in' | 'fee'>('out');
  const [previousAmountField, setPreviousAmountField] = useState<'out' | 'in'>('out');
  const [accountSelectConfig, setAccountSelectConfig] = useState<{
    open: boolean;
    title?: string;
    selectedAccountId?: string;
    disabledAccountIds?: string[];
    disabledReason?: string;
    filterType?: 'wallet' | 'contact' | 'all';
    onSelect: (acc: Account) => void;
  }>({
    open: false,
    onSelect: () => {},
  });

  const [isCategoryWarning, setIsCategoryWarning] = useState(false);
  const [isUserSelectedCat, setIsUserSelectedCat] = useState(false);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerCategoryWarning = () => {
    triggerHaptic('warning');
    setIsCategoryWarning(false);
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    requestAnimationFrame(() => {
      setIsCategoryWarning(true);
      warningTimeoutRef.current = setTimeout(() => {
        setIsCategoryWarning(false);
      }, 1500);
    });
  };

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, []);

  const TYPE_KEYS = ['expense', 'income', 'transfer', 'lend', 'borrow'] as const;
  const activeTypeKey = type === 'loan' ? (loanType === 'lend' ? 'lend' : 'borrow') : type;
  const activeTypeIndex = TYPE_KEYS.indexOf(activeTypeKey);

  const formSchema = z.object({
    amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
    categoryId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.categoryRequired')),
    accountId: (type === 'transfer' || type === 'loan') ? z.string().optional() : z.string().min(1, t('add.errors.accountRequired')),
    fromAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    toAccountId: (type === 'transfer' || type === 'loan') ? z.string().min(1, t('add.errors.accountRequired')) : z.string().optional(),
    transferInAmount: z.number().nonnegative(t('add.errors.amountPositive')).optional(),
    feeCategoryId: z.string().optional(),
    budgetId: z.string().optional(),
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
      date: getLocalDateString(),
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
        if (isBalanceAdjustmentTx(transactionToEdit, allCategories)) {
          toast.show(t('accounts.balanceAdjustmentCannotEdit', '餘額調整交易不允許編輯'));
          onClose();
          return;
        }

        // Edit mode
        if (transactionToEdit.splitGroupId) {
          const groupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId) || [];
          const loadedSplits: SplitItem[] = groupTxs
            .filter(t => t.type === 'loan' && t.toAccountId && t.category === 'advance')
            .map(t => ({ contactId: t.toAccountId!, amount: t.originalAmount }));
          setSplits(loadedSplits);
          const totalGroupOriginalAmount = groupTxs.reduce((sum, t) => sum + t.originalAmount, 0);
          setDisplayAmount(totalGroupOriginalAmount.toString());
        } else if (transactionToEdit.type === 'loan' && transactionToEdit.category === 'advance' && transactionToEdit.toAccountId) {
          setSplits([{ contactId: transactionToEdit.toAccountId, amount: transactionToEdit.originalAmount }]);
        } else {
          setSplits([]);
        }

        const isAdvanceLoan = transactionToEdit.type === 'loan' && transactionToEdit.category === 'advance';
        if (isAdvanceLoan) {
          setType('expense');
        } else {
          setType(transactionToEdit.type);
        }
        const isLend = transactionToEdit.type === 'loan' && contacts?.some(c => c.id === transactionToEdit.toAccountId);
        setLoanType(isLend ? 'lend' : 'borrow');
        setIsGift(!!transactionToEdit.isGift);
        
        // Set amount display correctly if not already set by splitGroup
        if (!transactionToEdit.splitGroupId) {
          setDisplayAmount(transactionToEdit.originalAmount.toString());
        }
        if (transactionToEdit.transferInAmount !== undefined && transactionToEdit.transferInAmount > 0) {
          setDisplayAmountIn(transactionToEdit.transferInAmount.toString());
        } else {
          setDisplayAmountIn('');
        }
        
        // If transfer, handle fee
        if (transactionToEdit.type === 'transfer') {
          if (transactionToEdit.splitGroupId) {
            const feeTx = transactions?.find(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.type === 'expense' && t.id !== transactionToEdit.id);
            if (feeTx) {
              setDisplayFeeAmount(feeTx.originalAmount.toString());
            } else if (transactionToEdit.transferInAmount !== undefined && transactionToEdit.originalAmount > transactionToEdit.transferInAmount) {
              setDisplayFeeAmount((transactionToEdit.originalAmount - transactionToEdit.transferInAmount).toString());
            } else {
              setDisplayFeeAmount('');
            }
          } else if (transactionToEdit.transferInAmount !== undefined && transactionToEdit.originalAmount > transactionToEdit.transferInAmount) {
            setDisplayFeeAmount((transactionToEdit.originalAmount - transactionToEdit.transferInAmount).toString());
          } else {
            setDisplayFeeAmount('');
          }
          setFocusedField('out');
        } else {
          setDisplayFeeAmount('');
          setFocusedField('out');
        }

        reset({
          amount: transactionToEdit.originalAmount,
          categoryId: transactionToEdit.category,
          accountId: transactionToEdit.accountId,
          fromAccountId: !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan') ? transactionToEdit.accountId : undefined,
          toAccountId: !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan') ? transactionToEdit.toAccountId || undefined : undefined,
          transferInAmount: transactionToEdit.transferInAmount,
          budgetId: transactionToEdit.budgetId || (transactionToEdit.type === 'income' ? 'none' : 'auto'),
          date: transactionToEdit.date,
          note: transactionToEdit.note || '',
        });
      } else {
        // Add mode
        const today = getLocalDateString();
        setType(initialType);
        reset({
          amount: '' as unknown as number,
          categoryId: initialCategoryId || '',
          accountId: initialAccountId || '',
          fromAccountId: '',
          toAccountId: initialToAccountId || '',
          transferInAmount: undefined,
          feeCategoryId: undefined,
          budgetId: initialType === 'income' ? 'none' : 'auto',
          date: today,
          note: initialNote || '',
        });
        setSplits(initialContactId ? [{ contactId: initialContactId, amount: 0 }] : []);
        setValue('budgetId', initialType === 'income' ? 'none' : 'auto');
        if (initialAmount && initialAmount > 0) {
          const roundedInit = roundToTwo(initialAmount);
          setDisplayAmount(roundedInit.toString());
          setValue('amount', roundedInit);
        } else {
          setDisplayAmount('');
        }
        if (initialToAccountId) {
          setValue('toAccountId', initialToAccountId);
        }
        if (initialAccountId) {
          setValue('accountId', initialAccountId);
        }
        if (initialCategoryId) {
          setValue('categoryId', initialCategoryId);
          setIsUserSelectedCat(true);
        }
        if (initialNote) {
          setValue('note', initialNote);
        }
        setDisplayAmountIn('');
        setDisplayFeeAmount('');
        setFocusedField('out');
        setPreviousAmountField('out');
        setValue('feeCategoryId', undefined);
        setLoanType(initialLoanType);
        setIsGift(false);
        setIsUserSelectedCat(Boolean(transactionToEditId || initialCategoryId));
      }
    }
  }, [isOpen, initialType, initialLoanType, initialContactId, initialToAccountId, initialAmount, initialAccountId, initialCategoryId, initialNote, transactionToEdit, transactions, baseCurrency, contacts, reset, setValue, transactionToEditId]);

  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer' | 'loan', newLoanType?: 'borrow' | 'lend') => {
    if (newType === type && (!newLoanType || newLoanType === loanType)) return;
    triggerHaptic('selection');
    const currentDate = watch('date') || getLocalDateString();
    setType(newType);
    reset({
      amount: '' as unknown as number,
      categoryId: '',
      accountId: watch('accountId') || '',
      fromAccountId: '',
      toAccountId: '',
      transferInAmount: undefined,
      feeCategoryId: undefined,
      budgetId: newType === 'income' ? 'none' : 'auto',
      date: currentDate,
      note: watch('note') || '',
    });
    setValue('budgetId', newType === 'income' ? 'none' : 'auto');
    setDisplayAmount('');
    setDisplayAmountIn('');
    setDisplayFeeAmount('');
    setFocusedField('out');
    setPreviousAmountField('out');
    setValue('feeCategoryId', undefined);
    const targetLoanType = newLoanType || 'borrow';
    setLoanType(targetLoanType);
    setIsGift(false);
    setIsUserSelectedCat(false);
  };

  const toggleLoanType = () => {
    triggerHaptic('selection');
    const nextLoanType = loanType === 'lend' ? 'borrow' : 'lend';
    setLoanType(nextLoanType);
    setFocusedField('out');
    setPreviousAmountField('out');
    const currentOut = displayAmount;
    const currentIn = displayAmountIn;
    setDisplayAmount(currentIn);
    setDisplayAmountIn(currentOut);
    const currentFrom = watch('fromAccountId');
    const currentTo = watch('toAccountId');
    setValue('fromAccountId', currentTo || '');
    setValue('toAccountId', currentFrom || '');
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

  const fromCurrency = useMemo(() => {
    if (type === 'transfer') {
      return selectedFromAccount?.currency || baseCurrency;
    }
    if (type === 'loan') {
      return loanWallet?.currency || baseCurrency;
    }
    return selectedAccount?.currency || baseCurrency;
  }, [type, selectedFromAccount, loanWallet, selectedAccount, baseCurrency]);

  const toCurrency = useMemo(() => {
    if (type === 'transfer') {
      return accounts?.find(a => a.id === selectedToAccountId)?.currency || baseCurrency;
    }
    if (type === 'loan') {
      return loanWallet?.currency || baseCurrency;
    }
    return baseCurrency;
  }, [type, selectedToAccountId, accounts, loanWallet, baseCurrency]);

  const isCrossCurrency = useMemo(() => {
    if (type === 'transfer') {
      return fromCurrency !== toCurrency;
    }
    return false;
  }, [type, fromCurrency, toCurrency]);

  const selectedCurrency = fromCurrency;
  const selectedToCurrency = toCurrency;

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

  const parsedFeeAmount = (type === 'transfer' && displayFeeAmount) ? (parseFloat(displayFeeAmount) || 0) : 0;
  const parsedAmount = parseFloat(displayAmount) || 0;
  const parsedAmountIn = parseFloat(displayAmountIn) || 0;

  const calculatedRate = useMemo(() => {
    if (parsedAmount > 0 && parsedAmountIn > 0) {
      return parsedAmountIn / parsedAmount;
    }
    return null;
  }, [parsedAmount, parsedAmountIn]);

  const transferDeductedAmount = parsedAmount + parsedFeeAmount;
  const transferReceivedAmount = isCrossCurrency
    ? parsedAmountIn
    : parsedAmount;
  const showTransferBubbles = type === 'transfer' && (parsedFeeAmount > 0 || isCrossCurrency);

  // 智慧分類記憶排序 (Smart Category Frequency & Recency)
  const categoryFrequencyStats = useMemo(() => {
    const stats: Record<string, { recentCount: number; totalCount: number; lastUsedTime: number }> = {};
    if (!transactions) return stats;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    transactions.forEach(t => {
      if (t.deleted || !t.category || t.type !== type) return;

      if (!stats[t.category]) {
        stats[t.category] = { recentCount: 0, totalCount: 0, lastUsedTime: 0 };
      }

      stats[t.category].totalCount += 1;
      const txTime = new Date(t.date).getTime();
      if (txTime >= thirtyDaysAgo) {
        stats[t.category].recentCount += 1;
      }
      if (txTime > stats[t.category].lastUsedTime) {
        stats[t.category].lastUsedTime = txTime;
      }
    });

    return stats;
  }, [transactions, type]);

  const frequentCategories = useMemo(() => {
    return [...filteredCategories].sort((a, b) => {
      const statA = categoryFrequencyStats[a.id];
      const statB = categoryFrequencyStats[b.id];

      // 綜合頻率評分：近 30 天使用次數權重 x3 + 歷史總次數
      const scoreA = (statA?.recentCount || 0) * 3 + (statA?.totalCount || 0);
      const scoreB = (statB?.recentCount || 0) * 3 + (statB?.totalCount || 0);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // 頻率相同時，以最後使用日期（Recency）優先
      const lastA = statA?.lastUsedTime || 0;
      const lastB = statB?.lastUsedTime || 0;
      if (lastA !== lastB) {
        return lastB - lastA;
      }

      // 未曾使用過時，預設分類優先，再按名稱自然排序
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredCategories, categoryFrequencyStats]);

  // 智慧語意預測：備註反向推斷分類
  const currentNote = watch('note') || '';

  const predictedResult = useMemo(() => {
    if (!currentNote.trim() || (type !== 'expense' && type !== 'income')) return null;
    return predictCategoryFromNote(currentNote, type, filteredCategories, transactions || []);
  }, [currentNote, type, filteredCategories, transactions]);

  // 當使用者未手動指定過分類時，若產生高信心預測，自動切換並給予輕微觸覺反饋
  useEffect(() => {
    if (predictedResult && !isUserSelectedCat) {
      if (selectedCategoryId !== predictedResult.category.id) {
        setValue('categoryId', predictedResult.category.id, { shouldValidate: true });
        setIsCategoryWarning(false);
        triggerHaptic('light');
      }
    }
  }, [predictedResult, isUserSelectedCat, selectedCategoryId, setValue]);

  const displayedPills = useMemo(() => {
    let list = [...frequentCategories];
    const targetCat = predictedResult ? predictedResult.category : (selectedCategoryId ? filteredCategories.find(c => c.id === selectedCategoryId) : null);
    
    if (targetCat) {
      list = [targetCat, ...list.filter(c => c.id !== targetCat.id)];
    }
    return list.slice(0, 6);
  }, [frequentCategories, predictedResult, selectedCategoryId, filteredCategories]);

  const handleSwapTransferAccounts = () => {
    const currentFrom = watch('fromAccountId');
    const currentTo = watch('toAccountId');
    if (currentFrom && currentTo) {
      setValue('fromAccountId', currentTo);
      setValue('toAccountId', currentFrom);
      const currentOut = displayAmount;
      const currentIn = displayAmountIn;
      setDisplayAmount(currentIn);
      setDisplayAmountIn(currentOut);
      setFocusedField('out');
      setPreviousAmountField('out');
    }
  };



  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const defaultAcc = accounts.find(a => a.isDefault) || accounts[0];

    if (type !== 'transfer' && type !== 'loan') {
      if (!selectedAccountId) {
        setValue('accountId', defaultAcc.id);
      }
      return;
    }

    if (type === 'transfer') {
      if (initialToAccountId && !selectedToAccountId) {
        setValue('toAccountId', initialToAccountId);
      }
      if (!selectedFromAccountId) {
        const candidate = accounts.find(a => a.id !== initialToAccountId && a.isDefault) || accounts.find(a => a.id !== initialToAccountId) || defaultAcc;
        setValue('fromAccountId', candidate.id);
      }
      return;
    }

    if (type === 'loan') {
      const specificContact = initialContactId ? contacts?.find(c => c.id === initialContactId) : undefined;
      if (loanType === 'lend') {
        if (!selectedFromAccountId) {
          setValue('fromAccountId', defaultAcc.id);
        }
        if (specificContact && !selectedToAccountId) {
          setValue('toAccountId', specificContact.id);
        }
      } else {
        if (specificContact && !selectedFromAccountId) {
          setValue('fromAccountId', specificContact.id);
        }
        if (!selectedToAccountId) {
          setValue('toAccountId', defaultAcc.id);
        }
      }
    }
  }, [accounts, type, loanType, contacts, setValue, initialContactId, selectedAccountId, selectedFromAccountId, selectedToAccountId, initialToAccountId]);

  const onSubmit = async (data: FormValues) => {
    try {
      const rateToBase = getRate(fromCurrency, baseCurrency);
      const exchangeRate = rateToBase;

      if (type === 'transfer') {
        const feeAmount = parseFloat(displayFeeAmount) || 0;
        const transferAmount = data.amount;
        const transferInAmount = isCrossCurrency
          ? (data.transferInAmount ?? transferAmount)
          : transferAmount;
        const transferRate = (isCrossCurrency && transferAmount > 0)
          ? (transferInAmount / transferAmount)
          : 1;
        const baseAmount = transferAmount * rateToBase;

        let feeCategoryId: string | undefined;
        if (feeAmount > 0) {
          let feeCat = categories?.find(c => c.type === 'expense' && (c.name === '手續費' || c.name === '手续费' || c.name.toLowerCase() === 'fee'));
          if (!feeCat) {
            feeCat = categories?.find(c => c.type === 'expense' && (c.name.includes('手續費') || c.name.includes('手续费') || c.name.toLowerCase().includes('fee')));
          }
          if (!feeCat) {
            const newCat = await addCategory('手續費', 'expense');
            feeCategoryId = newCat.id;
          } else {
            feeCategoryId = feeCat.id;
          }
        }

        const splitGroupId = (feeAmount > 0) ? (transactionToEdit?.splitGroupId || uuidv4()) : undefined;

        await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
          if (transactionToEdit) {
            if (transactionToEdit.splitGroupId) {
              const otherGroupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id) || [];
              for (const otherTx of otherGroupTxs) {
                await deleteTransaction(otherTx.id);
              }
            }
            await updateTransaction(transactionToEdit.id, {
              originalAmount: transferAmount,
              originalCurrency: fromCurrency,
              exchangeRate: transferRate,
              amount: baseAmount,
              type: 'transfer',
              category: 'transfer',
              accountId: data.fromAccountId!,
              toAccountId: data.toAccountId,
              transferInAmount: transferInAmount,
              splitGroupId,
              note: data.note,
              date: data.date,
            });

            if (feeAmount > 0 && feeCategoryId) {
              await addTransaction({
                originalAmount: feeAmount,
                originalCurrency: fromCurrency,
                exchangeRate: transferRate,
                amount: feeAmount * rateToBase,
                type: 'expense',
                category: feeCategoryId,
                accountId: data.fromAccountId!,
                splitGroupId,
                note: data.note?.trim() || undefined,
                date: data.date,
              });
            }
          } else {
            await addTransaction({
              originalAmount: transferAmount,
              originalCurrency: fromCurrency,
              exchangeRate: transferRate,
              amount: baseAmount,
              type: 'transfer',
              category: 'transfer',
              accountId: data.fromAccountId!,
              toAccountId: data.toAccountId,
              transferInAmount: transferInAmount,
              splitGroupId,
              note: data.note,
              date: data.date,
            });

            if (feeAmount > 0 && feeCategoryId) {
              await addTransaction({
                originalAmount: feeAmount,
                originalCurrency: fromCurrency,
                exchangeRate: transferRate,
                amount: feeAmount * rateToBase,
                type: 'expense',
                category: feeCategoryId,
                accountId: data.fromAccountId!,
                splitGroupId,
                note: data.note?.trim() || undefined,
                date: data.date,
              });
            }
          }
        });

        triggerHaptic('success');
        onClose();
        return;
      }

      if (type === 'loan') {
        const loanAmount = data.amount;
        const loanCurrency = loanWallet?.currency || baseCurrency;
        const isForeignLoan = loanCurrency !== baseCurrency;
        const loanRate = isForeignLoan ? rateToBase : 1;
        const loanBaseAmount = loanAmount * loanRate;

        if (transactionToEdit && transactionToEdit.splitGroupId) {
          const otherGroupTxs = transactions?.filter(t => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id) || [];
          for (const otherTx of otherGroupTxs) {
            await deleteTransaction(otherTx.id);
          }
        }

        const mainTx = {
          originalAmount: loanAmount,
          originalCurrency: loanCurrency,
          exchangeRate: loanRate,
          transferInAmount: undefined,
          amount: loanBaseAmount,
          type: 'loan' as const,
          category: 'loan',
          accountId: data.fromAccountId!,
          toAccountId: data.toAccountId!,
          note: data.note,
          date: data.date,
          isGift: isGift,
        };

        if (transactionToEdit) {
          await updateTransaction(transactionToEdit.id, mainTx);
        } else {
          await addTransaction(mainTx);
        }

        triggerHaptic('success');
        onClose();
        return;
      }

      const calculatedBaseAmount = data.amount * rateToBase;
      const validSplits = type === 'expense' ? splits.filter(s => s.amount > 0 && Boolean(s.contactId)) : [];
      const hasSplits = validSplits.length > 0;
      const isAdvance = hasSplits;

      // 多人分攤或部分代付分拆處理
      if (isAdvance) {
        const totalAdvanceOriginal = validSplits.reduce((sum, s) => sum + s.amount, 0);
        const selfExpenseOriginal = Math.max(0, Math.round((data.amount - totalAdvanceOriginal) * 100) / 100);
        const isMultiOrPartial = validSplits.length > 1 || (validSplits.length === 1 && selfExpenseOriginal > 0);

        if (isMultiOrPartial) {
          const splitGroupId = transactionToEdit?.splitGroupId || uuidv4();

          // 若為編輯模式，清除舊群組所有交易
          await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
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
            for (const s of validSplits) {
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
                splitGroupId,
                note: data.note,
                date: data.date,
              });
            }
          });

          triggerHaptic('success');
          onClose();
          return;
        }
      }

      const effectiveType = (isAdvance ? 'loan' : type) as 'expense' | 'income' | 'loan';
      const singleContactId = validSplits.length === 1 ? validSplits[0].contactId : undefined;
      
      const txData = {
        originalAmount: data.amount,
        originalCurrency: selectedCurrency,
        exchangeRate: exchangeRate,
        amount: calculatedBaseAmount,
        type: effectiveType,
        category: isAdvance 
          ? 'advance' 
          : data.categoryId!,
        accountId: data.accountId!,
        toAccountId: isAdvance 
          ? singleContactId 
          : undefined,
        transferInAmount: undefined,
        budgetId: isAdvance ? undefined : data.budgetId,
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
      
      triggerHaptic('success');
      onClose();
    } catch (err: any) {
      console.error('Failed to submit transaction:', err);
      toast.show(err?.message || t('common.error', '保存失敗，請重試'));
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const newCat = await addCategory(newCatName.trim(), type as 'expense'|'income');
    setValue('categoryId', newCat.id);
    setNewCatName('');
    setIsCatDialogOpen(false);
  };

  const handleKeypadSubmit = () => {
    if (isCrossCurrency) {
      const outVal = roundToTwo(parseFloat(displayAmount) || 0);
      const inVal = roundToTwo(parseFloat(displayAmountIn) || 0);
      if (outVal <= 0) {
        toast.show(t('add.errors.outflowRequired', '請輸入出款金額'));
        setFocusedField('out');
        return;
      }
      if (inVal <= 0) {
        toast.show(t('add.errors.inflowRequired', '請輸入到款金額'));
        setFocusedField('in');
        return;
      }
      setValue('amount', outVal);
      setValue('transferInAmount', inVal);
    } else {
      const parsed = parseFloat(displayAmount);
      if (isNaN(parsed) || parsed <= 0) {
        if (type === 'transfer' && focusedField === 'fee') {
          setFocusedField('out');
        }
        return;
      }
      const val = roundToTwo(parsed);
      setValue('amount', val);
      if (type === 'transfer') {
        setValue('transferInAmount', val);
      }
    }
    
    handleSubmit(onSubmit, (invalidErrors) => {
      if (invalidErrors.categoryId) {
        triggerCategoryWarning();
        toast.show(t('add.errors.pleaseSelectCategory'));
      } else if (invalidErrors.amount) {
        toast.show(invalidErrors.amount.message || t('add.errors.amountRequired'));
      } else if (invalidErrors.accountId) {
        toast.show(invalidErrors.accountId.message || t('add.errors.accountRequired'));
      } else {
        const firstKey = Object.keys(invalidErrors)[0];
        const errorMsg = (invalidErrors as any)[firstKey]?.message;
        if (typeof errorMsg === 'string') {
          toast.show(errorMsg);
        }
      }
    })();
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
        className="select-none min-h-0 sm:overflow-visible"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{transactionToEditId ? t('dashboard.edit', '編輯') : t('nav.add')}</DialogTitle>
        </DialogHeader>

        {/* Scrollable Content Wrapper to prevent squashing and ensure scrolling below minimum threshold */}
        <div className="w-full min-h-full flex flex-col gap-2.5 sm:gap-3">
          {/* 1. Top Bar: Segmented Control & Close Button (h-9 / 36px, Sticky Top) */}
          <div className="sticky top-0 z-20 w-full flex items-center justify-between gap-2 shrink-0 bg-background/95 sm:bg-card/95 backdrop-blur-md py-1 -mt-1">
            <div className="relative h-9 flex-1 bg-muted/80 border border-border p-0.5 rounded-full flex items-center justify-between text-xs font-medium select-none overflow-hidden">
              {/* Sliding Segmented Indicator */}
              <div
                className="absolute inset-y-0.5 rounded-full bg-primary pointer-events-none z-0 shadow-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  left: '2px',
                  width: 'calc((100% - 4px) / 5)',
                  transform: `translate3d(${activeTypeIndex * 100}%, 0, 0)`,
                }}
                aria-hidden="true"
              />

              <button 
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={cn(
                  "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
                  activeTypeKey === 'expense' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('add.expense')}
              </button>
              <button 
                type="button"
                onClick={() => handleTypeChange('income')}
                className={cn(
                  "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
                  activeTypeKey === 'income' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
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
                  "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
                  walletCount < 2 && activeTypeKey !== 'transfer' && "opacity-40 cursor-not-allowed",
                  activeTypeKey === 'transfer' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('add.transfer')}
              </button>
              <button 
                type="button"
                onClick={() => handleTypeChange('loan', 'lend')}
                className={cn(
                  "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
                  activeTypeKey === 'lend' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('add.lend')}
              </button>
              <button 
                type="button"
                onClick={() => handleTypeChange('loan', 'borrow')}
                className={cn(
                  "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
                  activeTypeKey === 'borrow' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('add.borrow')}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Hero Section: Amount & Account / Dual Cards */}
          <div className="w-full flex-1 flex flex-col items-center justify-center [justify-content:safe_center] my-auto py-1 sm:py-2">
            {/* Case A: Expense / Income -> [Account Badge] then [Amount] */}
            {(type === 'expense' || type === 'income') && (
              <>
                <div className="mb-1.5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountSelectConfig({
                        open: true,
                        title: t('accounts.selectAccountTitle', '選擇帳戶'),
                        selectedAccountId: selectedAccountId || undefined,
                        filterType: 'wallet',
                        onSelect: (acc) => setValue('accountId', acc.id),
                      });
                    }}
                    className="h-7 px-3 py-0 rounded-full bg-muted/80 border border-border text-xs text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center gap-1.5 w-auto shadow-none"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>
                      {selectedAccountId ? accounts?.find(a => a.id === selectedAccountId)?.name : t('add.account')}
                    </span>
                  </button>
                </div>

                {/* Massive Monospace Amount Display with Safe AutoMarquee */}
                <div className="w-full max-w-full overflow-hidden px-4 py-1">
                  <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
                    <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
                      <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">{selectedCurrency}</span>
                      <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
                        {formatDisplayAmount(displayAmount)}
                      </span>
                    </div>
                  </AutoMarquee>
                </div>

                {errors.amount && <p className="text-xs font-medium text-destructive mt-1">{errors.amount.message}</p>}
                {errors.accountId && <p className="text-xs font-medium text-destructive mt-1">{errors.accountId.message}</p>}
              </>
            )}

            {/* Case B: Transfer -> [Amount] then [Fee Pill] then [Dual Cards] */}
            {type === 'transfer' && (
              <>
                {/* Massive Monospace Amount Display (Transfer Field Focus Switchable) with Safe AutoMarquee */}
                <div className="w-full max-w-full overflow-hidden px-4 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (focusedField === 'fee') {
                        setFocusedField(previousAmountField);
                      } else if (isCrossCurrency) {
                        const next = focusedField === 'in' ? 'out' : 'in';
                        setPreviousAmountField(next);
                        setFocusedField(next);
                      } else {
                        setPreviousAmountField('out');
                        setFocusedField('out');
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-center py-1 px-2 rounded-2xl transition-all cursor-pointer shadow-none overflow-hidden",
                      (focusedField === 'out' || focusedField === 'in')
                        ? "opacity-100"
                        : "opacity-40 hover:opacity-80"
                    )}
                    title={
                      isCrossCurrency
                        ? (focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in')
                            ? t('add.inflow', '到款')
                            : t('add.outflow', '出款'))
                        : t('add.transferAmount', '轉帳')
                    }
                  >
                    <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
                      <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
                        <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">
                          {isCrossCurrency && (focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in')) ? toCurrency : fromCurrency}
                        </span>
                        <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
                          {formatDisplayAmount(
                            isCrossCurrency && (focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in'))
                              ? displayAmountIn
                              : displayAmount
                          )}
                        </span>
                      </div>
                    </AutoMarquee>
                  </button>
                </div>

                {/* Transfer Fee Pill & Cross Currency Rate Pill */}
                <div className="h-7 flex items-center justify-center gap-2 my-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (focusedField === 'fee') {
                        setFocusedField(previousAmountField);
                      } else {
                        setPreviousAmountField(focusedField === 'in' ? 'in' : 'out');
                        setFocusedField('fee');
                      }
                    }}
                    className={cn(
                      "h-7 px-3 rounded-full border text-[11px] inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-none shrink-0",
                      focusedField === 'fee'
                        ? "bg-amber-500/15 border-amber-500/70 text-foreground ring-1 ring-amber-500/40 font-semibold"
                        : parsedFeeAmount > 0
                          ? "bg-muted/80 border-border text-foreground hover:border-foreground/30"
                          : "bg-muted/60 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    <Zap className={cn("w-3 h-3", (focusedField === 'fee' || parsedFeeAmount > 0) ? "text-amber-500" : "text-muted-foreground")} />
                    <span>{t('add.fee', '手續費')}：</span>
                    <span className="font-mono font-semibold text-foreground">
                      {parsedFeeAmount > 0 ? `${parsedFeeAmount.toLocaleString()} ${fromCurrency}` : t('add.noFee', '無手續費')}
                    </span>
                  </button>

                  {isCrossCurrency && (
                    <div
                      className="h-7 px-2.5 rounded-full border border-border bg-muted/60 text-[11px] font-mono inline-flex items-center gap-1 shadow-none text-muted-foreground select-none shrink-0"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                      {calculatedRate !== null ? (
                        <span>1 {fromCurrency} ≈ {parseFloat(calculatedRate.toFixed(4)).toString()} {toCurrency}</span>
                      ) : parsedAmount > 0 ? (
                        <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
                      ) : parsedAmountIn > 0 ? (
                        <span>{t('add.pendingOutflow', '待輸入出款')} ≈ {parsedAmountIn} {toCurrency}</span>
                      ) : (
                        <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
                      )}
                    </div>
                  )}
                </div>

                {errors.amount && <p className="text-xs font-medium text-destructive mt-1">{errors.amount.message}</p>}

                {/* Dual Standalone Cards with Overlapping Swap Button for Transfer */}
                <div className="relative w-full flex items-stretch gap-2 mt-6 sm:mt-7 mb-1 overflow-visible">
                  {/* Left Card: 轉出 (FROM) */}
                  <div className="relative flex-1 min-w-0 overflow-visible">
                    {showTransferBubbles && (
                      <div className="absolute -top-3.5 left-0 sm:-left-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                            {t('add.cardDeducted', '實扣')}
                          </span>
                          <span className="text-xs font-mono font-bold whitespace-nowrap">
                            {selectedCurrency} {formatAmountNumber(transferDeductedAmount)}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setAccountSelectConfig({
                          open: true,
                          title: t('add.transferFrom', '轉出'),
                          selectedAccountId: selectedFromAccountId || undefined,
                          disabledAccountIds: selectedToAccountId ? [selectedToAccountId] : [],
                          disabledReason: t('accounts.alreadySelectedTarget', '當前轉入帳戶'),
                          filterType: 'wallet',
                          onSelect: (acc) => setValue('fromAccountId', acc.id),
                        });
                      }}
                      className={cn(
                        "w-full h-full min-h-[72px] sm:min-h-[76px] rounded-2xl border p-3 sm:p-3.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
                        selectedFromAccountId && accounts?.some(a => a.id === selectedFromAccountId)
                          ? "bg-card border-border hover:bg-muted/30"
                          : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="w-full flex items-center justify-start gap-1 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('add.transferFrom', '轉出')}
                        </span>
                      </div>
                      <div className="w-full min-w-0 pr-3">
                        <span className="text-base sm:text-lg font-bold text-foreground truncate block leading-tight">
                          {accounts?.find(a => a.id === selectedFromAccountId)?.name || '\u00A0'}
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Center Overlap Swap Button */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSwapTransferAccounts();
                      }}
                      className="w-8 h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
                      title={t('add.swapAccounts', '對調帳戶')}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Right Card: 轉入 (TO) */}
                  <div className="relative flex-1 min-w-0 overflow-visible">
                    {showTransferBubbles && (
                      <div className="absolute -top-3.5 right-0 sm:-right-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                            {t('add.cardReceived', '實收')}
                          </span>
                          <span className="text-xs font-mono font-bold whitespace-nowrap">
                            {selectedToCurrency} {formatAmountNumber(transferReceivedAmount)}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setAccountSelectConfig({
                          open: true,
                          title: t('add.transferTo', '轉入'),
                          selectedAccountId: selectedToAccountId || undefined,
                          disabledAccountIds: selectedFromAccountId ? [selectedFromAccountId] : [],
                          disabledReason: t('accounts.alreadySelectedSource', '當前轉出帳戶'),
                          filterType: 'wallet',
                          onSelect: (acc) => setValue('toAccountId', acc.id),
                        });
                      }}
                      className={cn(
                        "w-full h-full min-h-[72px] sm:min-h-[76px] rounded-2xl border p-3 sm:p-3.5 flex flex-col justify-between items-end text-right cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
                        selectedToAccountId && accounts?.some(a => a.id === selectedToAccountId)
                          ? "bg-card border-border hover:bg-muted/30"
                          : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="w-full flex items-center justify-end gap-1 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('add.transferTo', '轉入')}
                        </span>
                      </div>
                      <div className="w-full min-w-0 pl-3">
                        <span className="text-base sm:text-lg font-bold text-foreground truncate block leading-tight text-right">
                          {accounts?.find(a => a.id === selectedToAccountId)?.name || '\u00A0'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {(errors.fromAccountId || errors.toAccountId) && (
                  <p className="text-xs font-medium text-destructive mt-1">{(errors.fromAccountId || errors.toAccountId)?.message}</p>
                )}
              </>
            )}

            {/* Case C: Loan -> [Amount] then [Avatars Row] then [Dual Cards] */}
            {type === 'loan' && (
              <>
                {/* Massive Monospace Amount Display with Safe AutoMarquee */}
                <div className="w-full max-w-full overflow-hidden px-4 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCrossCurrency) {
                        setFocusedField(prev => prev === 'in' ? 'out' : 'in');
                      } else {
                        setFocusedField('out');
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-center py-1 px-2 rounded-2xl transition-all cursor-pointer shadow-none overflow-hidden",
                      (focusedField === 'out' || focusedField === 'in')
                        ? "opacity-100"
                        : "opacity-40 hover:opacity-80"
                    )}
                    title={isCrossCurrency ? (focusedField === 'in' ? t('add.inflow', '到款') : t('add.outflow', '出款')) : t('add.loanAmount', '借貸金額')}
                  >
                    <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
                      <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
                        <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">
                          {isCrossCurrency && focusedField === 'in' ? toCurrency : fromCurrency}
                        </span>
                        <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
                          {formatDisplayAmount(isCrossCurrency && focusedField === 'in' ? displayAmountIn : displayAmount)}
                        </span>
                      </div>
                    </AutoMarquee>
                  </button>
                </div>

                {/* Loan Info Row: Gift Badge (Left) & Rate Pill (Right) - Same Row, Fixed Height h-7 */}
                <div className="h-7 flex items-center justify-center gap-2 my-1">
                  {isGift && (
                    <div
                      className="h-7 px-2.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[11px] font-medium inline-flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150 select-none shrink-0"
                    >
                      <Gift className="w-3 h-3 text-purple-500 shrink-0" />
                      <span>{t('add.gift', '贈與')}</span>
                    </div>
                  )}

                  {isCrossCurrency && (
                    <div
                      className="h-7 px-2.5 rounded-full border border-border bg-muted/60 text-[11px] font-mono inline-flex items-center gap-1 shadow-none text-muted-foreground select-none shrink-0"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                      {calculatedRate !== null ? (
                        <span>1 {fromCurrency} ≈ {parseFloat(calculatedRate.toFixed(4)).toString()} {toCurrency}</span>
                      ) : parsedAmount > 0 ? (
                        <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
                      ) : parsedAmountIn > 0 ? (
                        <span>{t('add.pendingOutflow', '待輸入出款')} ≈ {parsedAmountIn} {toCurrency}</span>
                      ) : (
                        <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
                      )}
                    </div>
                  )}
                </div>

                {errors.amount && <p className="text-xs font-medium text-destructive mt-1">{errors.amount.message}</p>}

                {/* Dual Standalone Cards with Overlapping Toggle Button for Loan */}
                <div className="relative w-full flex items-stretch gap-2 mt-6 sm:mt-7 mb-1 overflow-visible">
                  {/* Left Card: Wallet (if lend) OR Contact (if borrow) */}
                  <div className="relative flex-1 min-w-0 overflow-visible">
                    {/* Left Avatar: Overlapping top-right corner */}
                    <div className="absolute top-0 -translate-y-1/2 right-3 sm:right-4 z-20 pointer-events-none">
                      {loanType === 'lend' ? (
                        <div 
                          className="w-9 h-9 rounded-full bg-foreground text-background border border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                          title={t('add.me')}
                        >
                          {t('add.me')}
                        </div>
                      ) : loanContact ? (
                        <ContactAvatar 
                          group={loanContact.group}
                          className="w-9 h-9 bg-card"
                          iconClassName="w-4 h-4 text-muted-foreground"
                          title={loanContact.name}
                        />
                      ) : (
                        <div 
                          className="w-9 h-9 rounded-full bg-card text-muted-foreground/40 border border-dashed border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                          title={t('add.contact')}
                        >
                          ?
                        </div>
                      )}
                    </div>

                    {isCrossCurrency && parsedAmount > 0 && (
                      <div className="absolute -top-3.5 left-0 sm:-left-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                            {t('add.outflow', '出款')}
                          </span>
                          <span className="text-xs font-mono font-bold whitespace-nowrap">
                            {fromCurrency} {formatAmountNumber(parsedAmount)}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const isLend = loanType === 'lend';
                        setAccountSelectConfig({
                          open: true,
                          title: isLend ? t('add.lendFrom', '出款') : t('add.borrowFrom', '出款'),
                          selectedAccountId: selectedFromAccountId || undefined,
                          filterType: isLend ? 'wallet' : 'contact',
                          disabledAccountIds: selectedToAccountId ? [selectedToAccountId] : [],
                          disabledReason: isLend ? t('accounts.alreadySelectedTarget') : undefined,
                          onSelect: (acc) => setValue('fromAccountId', acc.id),
                        });
                      }}
                      className={cn(
                        "w-full h-full min-h-[72px] sm:min-h-[76px] rounded-2xl border p-3 sm:p-3.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
                        (loanType === 'lend' ? (selectedFromAccountId && accounts?.some(a => a.id === selectedFromAccountId)) : Boolean(loanContact))
                          ? "bg-card border-border hover:bg-muted/30"
                          : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="w-full flex items-center justify-start gap-1 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {loanType === 'lend' ? t('add.lendFrom', '出款') : t('add.borrowFrom', '出款')}
                        </span>
                      </div>
                      <div className="w-full min-w-0 pr-3">
                        <span className="text-base sm:text-lg font-bold text-foreground truncate block leading-tight">
                          {loanType === 'lend'
                            ? (accounts?.find(a => a.id === selectedFromAccountId)?.name || '\u00A0')
                            : (loanContact?.name || '\u00A0')}
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Center Overlap Toggle Button */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLoanType();
                      }}
                      className="w-8 h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
                      title={loanType === 'lend' ? t('add.lend') : t('add.borrow')}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Right Card: Contact (if lend) OR Wallet (if borrow) */}
                  <div className="relative flex-1 min-w-0 overflow-visible">
                    {/* Right Avatar: Overlapping top-left corner */}
                    <div className="absolute top-0 -translate-y-1/2 left-3 sm:left-4 z-20 pointer-events-none">
                      {loanType === 'lend' ? (
                        loanContact ? (
                          <ContactAvatar 
                            group={loanContact.group}
                            className="w-9 h-9 bg-card"
                            iconClassName="w-4 h-4 text-muted-foreground"
                            title={loanContact.name}
                          />
                        ) : (
                          <div 
                            className="w-9 h-9 rounded-full bg-card text-muted-foreground/40 border border-dashed border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                            title={t('add.contact')}
                          >
                            ?
                          </div>
                        )
                      ) : (
                        <div 
                          className="w-9 h-9 rounded-full bg-foreground text-background border border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                          title={t('add.me')}
                        >
                          {t('add.me')}
                        </div>
                      )}
                    </div>

                    {isCrossCurrency && parsedAmountIn > 0 && (
                      <div className="absolute -top-3.5 right-0 sm:-right-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                            {t('add.inflow', '到款')}
                          </span>
                          <span className="text-xs font-mono font-bold whitespace-nowrap">
                            {toCurrency} {formatAmountNumber(parsedAmountIn)}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const isLend = loanType === 'lend';
                        setAccountSelectConfig({
                          open: true,
                          title: isLend ? t('add.lendTo', '入款') : t('add.borrowTo', '入款'),
                          selectedAccountId: selectedToAccountId || undefined,
                          filterType: isLend ? 'contact' : 'wallet',
                          disabledAccountIds: selectedFromAccountId ? [selectedFromAccountId] : [],
                          disabledReason: !isLend ? t('accounts.alreadySelectedSource') : undefined,
                          onSelect: (acc) => setValue('toAccountId', acc.id),
                        });
                      }}
                      className={cn(
                        "w-full h-full min-h-[72px] sm:min-h-[76px] rounded-2xl border p-3 sm:p-3.5 flex flex-col justify-between items-end text-right cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
                        (loanType === 'lend' ? Boolean(loanContact) : (selectedToAccountId && accounts?.some(a => a.id === selectedToAccountId)))
                          ? "bg-card border-border hover:bg-muted/30"
                          : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="w-full flex items-center justify-end gap-1 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {loanType === 'lend' ? t('add.lendTo', '入款') : t('add.borrowTo', '入款')}
                        </span>
                      </div>
                      <div className="w-full min-w-0 pl-3">
                        <span className="text-base sm:text-lg font-bold text-foreground truncate block leading-tight text-right">
                          {loanType === 'lend'
                            ? (loanContact?.name || '\u00A0')
                            : (accounts?.find(a => a.id === selectedToAccountId)?.name || '\u00A0')}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {(errors.fromAccountId || errors.toAccountId) && (
                  <p className="text-xs font-medium text-destructive mt-1">{(errors.fromAccountId || errors.toAccountId)?.message}</p>
                )}
              </>
            )}

          </div>

        {/* 3. Lower Control Deck: Categories + Note + Keypad with strictly uniform gap-2 (8px) */}
        <div className="w-full flex flex-col gap-2 shrink-0 mt-auto">
          {/* Category Pills (for expense / income) */}
          {(type === 'expense' || type === 'income') && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full">
              {filteredCategories.length > 0 ? (
                <>
                  {displayedPills.map(cat => {
                    const isSelected = selectedCategoryId === cat.id;
                    const isPredicted = predictedResult?.category.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('selection');
                          setIsUserSelectedCat(true);
                          setValue('categoryId', cat.id, { shouldValidate: true });
                          setIsCategoryWarning(false);
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors duration-500 cursor-pointer border flex items-center gap-1",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary font-semibold shadow-none"
                            : isCategoryWarning
                              ? "bg-muted/80 border-destructive/80 text-foreground hover:border-foreground/40"
                              : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        )}
                      >
                        {isPredicted && (
                          <Sparkles className={cn("w-3 h-3 shrink-0", isSelected ? "text-primary-foreground" : "text-amber-500 animate-pulse")} />
                        )}
                        <span>{cat.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCatPickerOpen(true);
                      setIsCategoryWarning(false);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border border-dashed shrink-0 transition-colors duration-500 cursor-pointer flex items-center gap-1",
                      isCategoryWarning
                        ? "border-destructive/80 text-foreground hover:border-foreground/50"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    )}
                    title={t('add.moreCategories', '更多分類')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-[11px]">{t('common.more', '更多')}</span>
                  </button>
                </>
              ) : (
                <div className="w-full flex items-center justify-center py-1 text-xs text-muted-foreground select-none">
                  <span>{t('add.noCategoriesAvailable')}</span>
                </div>
              )}
            </div>
          )}

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

          {/* Integrated Keypad */}
          <div className="w-full">
          <NumericKeypad 
            value={
              type === 'transfer' && focusedField === 'fee'
                ? displayFeeAmount
                : isCrossCurrency && focusedField === 'in'
                ? displayAmountIn
                : displayAmount
            } 
            onChange={(val) => {
              notifyTyping();
              if (type === 'transfer' && focusedField === 'fee') {
                setDisplayFeeAmount(val);
              } else if (isCrossCurrency && focusedField === 'in') {
                setDisplayAmountIn(val);
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
            }}
            currencySymbol={getCurrencySymbol(fromCurrency)}
            contacts={contacts}
            feeAmount={type === 'transfer' ? parsedFeeAmount : 0}
            isFeeActive={type === 'transfer' && focusedField === 'fee'}
            onToggleFeeMode={() => {
              if (focusedField === 'fee') {
                setFocusedField(previousAmountField);
              } else {
                setPreviousAmountField(focusedField === 'in' ? 'in' : 'out');
                setFocusedField('fee');
              }
            }}
            isCrossCurrency={isCrossCurrency}
            activeAmountField={focusedField === 'fee' ? null : (focusedField === 'in' ? 'in' : 'out')}
            onSelectAmountField={(field) => {
              setPreviousAmountField(field);
              setFocusedField(field);
            }}
            fromCurrency={fromCurrency}
            toCurrency={toCurrency}
            isGift={isGift}
            onToggleGift={() => setIsGift(prev => !prev)}
          />
        </div>
      </div>
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
              {filteredCategories.length === 0 && (
                <div className="col-span-4 py-4 text-center text-xs text-muted-foreground">
                  {t('add.noCategoriesAvailable')}
                </div>
              )}
              {frequentCategories.map(cat => {
                const isSelected = selectedCategoryId === cat.id;
                const total = categoryMonthlyTotals[cat.id] || 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setIsUserSelectedCat(true);
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

        {/* Account / Contact Select Dialog */}
        <AccountSelectDialog
          open={accountSelectConfig.open}
          onOpenChange={(open) => setAccountSelectConfig(prev => ({ ...prev, open }))}
          title={accountSelectConfig.title}
          selectedAccountId={accountSelectConfig.selectedAccountId}
          disabledAccountIds={accountSelectConfig.disabledAccountIds}
          disabledReason={accountSelectConfig.disabledReason}
          filterType={accountSelectConfig.filterType}
          onSelectAccount={(acc) => {
            accountSelectConfig.onSelect(acc);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
