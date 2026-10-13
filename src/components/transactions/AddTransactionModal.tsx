import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useBudgets } from '@/hooks/useBudgets';
import { useExchangeRates } from '@/hooks/useExchangeRates';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { getCurrencySymbol, isBalanceAdjustmentTx, getLocalDateString } from '@/lib/utils';
import { db } from '@/services/db/db';

import { NumericKeypad } from './NumericKeypad';
import { AccountSelectDialog } from '@/components/accounts/AccountSelectDialog';
import { SplitAdvanceDialog, type SplitItem } from './SplitAdvanceDialog';

import type {
  AddTransactionModalProps,
  TransactionType,
  LoanType,
  KeypadFocusedField,
  AccountSelectConfig,
} from './add-modal/types';
import { TransactionTypeSelector } from './add-modal/components/TransactionTypeSelector';
import { AmountHeroSection } from './add-modal/components/AmountHeroSection';
import { TransferDualCards } from './add-modal/components/TransferDualCards';
import { LoanDualCards } from './add-modal/components/LoanDualCards';
import { CategoryChipsRow } from './add-modal/components/CategoryChipsRow';
import { InlineNoteInput } from './add-modal/components/InlineNoteInput';
import { AddCategoryQuickDialog } from './add-modal/dialogs/AddCategoryQuickDialog';
import { CategoryPickerQuickDialog } from './add-modal/dialogs/CategoryPickerQuickDialog';
import { TagPickerQuickDialog } from './add-modal/dialogs/TagPickerQuickDialog';
import { useCategoryPrediction } from './add-modal/hooks/useCategoryPrediction';
import { useEdgeSwipeBack } from './add-modal/hooks/useEdgeSwipeBack';

const roundToTwo = (val: number): number => Math.round(val * 100) / 100;

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
}: AddTransactionModalProps) {
  const { t } = useTranslation();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { categories, allCategories, addCategory } = useCategories();
  const { tags, addTag } = useTags();
  const { wallets: accounts, contacts } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { budgets } = useBudgets();
  const { getRate } = useExchangeRates();

  const walletCount = accounts?.length ?? 0;
  const activeLedger = ledgers?.find((l) => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  // 基本記帳狀態
  const [type, setType] = useState<TransactionType>(initialType);
  const [loanType, setLoanType] = useState<LoanType>(initialLoanType);
  const [isGift, setIsGift] = useState(false);
  const [splits, setSplits] = useState<SplitItem[]>([]);

  // 彈窗開關狀態
  const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
  const [isCatPickerOpen, setIsCatPickerOpen] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // 金額字串與輸入焦點槽位
  const [displayAmount, setDisplayAmount] = useState('');
  const [displayAmountIn, setDisplayAmountIn] = useState('');
  const [displayFeeAmount, setDisplayFeeAmount] = useState('');
  const [focusedField, setFocusedField] = useState<KeypadFocusedField>('out');
  const [previousAmountField, setPreviousAmountField] = useState<'out' | 'in'>('out');

  // 打字中狀態計時器
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

  // 帳戶選擇器配置
  const [accountSelectConfig, setAccountSelectConfig] = useState<AccountSelectConfig>({
    open: false,
    onSelect: () => {},
  });

  // 分類警告狀態
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

  const selectedTagNames = useMemo(() => {
    if (!selectedTagIds.length || !tags) return [];
    return selectedTagIds
      .map((id) => tags.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[];
  }, [selectedTagIds, tags]);

  // 表單驗證 Schema
  const formSchema = z
    .object({
      amount: z.number({ message: t('add.errors.amountRequired') }).positive(t('add.errors.amountPositive')),
      categoryId:
        type === 'transfer' || type === 'loan'
          ? z.string().optional()
          : z.string().min(1, t('add.errors.categoryRequired')),
      accountId:
        type === 'transfer' || type === 'loan'
          ? z.string().optional()
          : z.string().min(1, t('add.errors.accountRequired')),
      fromAccountId:
        type === 'transfer' || type === 'loan'
          ? z.string().min(1, t('add.errors.accountRequired'))
          : z.string().optional(),
      toAccountId:
        type === 'transfer' || type === 'loan'
          ? z.string().min(1, t('add.errors.accountRequired'))
          : z.string().optional(),
      transferInAmount: z.number().nonnegative(t('add.errors.amountPositive')).optional(),
      feeCategoryId: z.string().optional(),
      budgetId: z.string().optional(),
      date: z.string().min(1, t('add.errors.dateRequired')),
      note: z.string().optional(),
    })
    .refine(
      (data) => {
        if (
          (type === 'transfer' || type === 'loan') &&
          data.fromAccountId &&
          data.toAccountId &&
          data.fromAccountId === data.toAccountId
        ) {
          return false;
        }
        return true;
      },
      {
        message: t('add.errors.sameAccount'),
        path: ['toAccountId'],
      }
    );

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
    return transactions.find((t) => t.id === transactionToEditId) || null;
  }, [transactionToEditId, transactions]);

  // 記錄彈窗開啟與編輯目標載入狀態，防止背景任務更新或父層重新渲染導致重複重設
  const prevIsOpenRef = useRef(false);
  const loadedEditIdRef = useRef<string | null>(null);
  const hasInitializedAddRef = useRef(false);

  // 編輯模式載入或新增模式重設
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      loadedEditIdRef.current = null;
      hasInitializedAddRef.current = false;
      return;
    }

    // 1. 編輯模式處理
    if (transactionToEditId) {
      // 若該目標交易已經成功載入至表單，鎖定避免重複載入覆寫用戶當前編輯
      if (loadedEditIdRef.current === transactionToEditId) {
        prevIsOpenRef.current = true;
        return;
      }

      // 等待交易資料從 Dexie 非同步 Resolve
      if (!transactionToEdit) {
        prevIsOpenRef.current = true;
        return;
      }

      if (isBalanceAdjustmentTx(transactionToEdit, allCategories)) {
        toast.show(t('accounts.balanceAdjustmentCannotEdit', '餘額調整交易不允許編輯'));
        onClose();
        return;
      }

      // 標記該交易已載入
      loadedEditIdRef.current = transactionToEditId;
      hasInitializedAddRef.current = false;

      // 編輯模式：分攤群組解析
      if (transactionToEdit.splitGroupId) {
        const groupTxs =
          transactions?.filter((t) => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId) || [];
        const loadedSplits: SplitItem[] = groupTxs
          .filter((t) => t.type === 'loan' && t.toAccountId && t.category === 'advance')
          .map((t) => ({ contactId: t.toAccountId!, amount: t.originalAmount }));
        setSplits(loadedSplits);
        const totalGroupOriginalAmount = groupTxs.reduce((sum, t) => sum + t.originalAmount, 0);
        setDisplayAmount(totalGroupOriginalAmount.toString());
      } else if (
        transactionToEdit.type === 'loan' &&
        transactionToEdit.category === 'advance' &&
        transactionToEdit.toAccountId
      ) {
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
      const isLend =
        transactionToEdit.type === 'loan' && contacts?.some((c) => c.id === transactionToEdit.toAccountId);
      setLoanType(isLend ? 'lend' : 'borrow');
      setIsGift(!!transactionToEdit.isGift);

      if (!transactionToEdit.splitGroupId) {
        setDisplayAmount(transactionToEdit.originalAmount.toString());
      }
      if (transactionToEdit.transferInAmount !== undefined && transactionToEdit.transferInAmount > 0) {
        setDisplayAmountIn(transactionToEdit.transferInAmount.toString());
      } else {
        setDisplayAmountIn('');
      }

      // 轉帳手續費解析
      if (transactionToEdit.type === 'transfer') {
        if (transactionToEdit.splitGroupId) {
          const feeTx = transactions?.find(
            (t) =>
              !t.deleted &&
              t.splitGroupId === transactionToEdit.splitGroupId &&
              t.type === 'expense' &&
              t.id !== transactionToEdit.id
          );
          if (feeTx) {
            setDisplayFeeAmount(feeTx.originalAmount.toString());
          } else if (
            transactionToEdit.transferInAmount !== undefined &&
            transactionToEdit.originalAmount > transactionToEdit.transferInAmount
          ) {
            setDisplayFeeAmount((transactionToEdit.originalAmount - transactionToEdit.transferInAmount).toString());
          } else {
            setDisplayFeeAmount('');
          }
        } else if (
          transactionToEdit.transferInAmount !== undefined &&
          transactionToEdit.originalAmount > transactionToEdit.transferInAmount
        ) {
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
        fromAccountId:
          !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan')
            ? transactionToEdit.accountId
            : undefined,
        toAccountId:
          !isAdvanceLoan && (transactionToEdit.type === 'transfer' || transactionToEdit.type === 'loan')
            ? transactionToEdit.toAccountId || undefined
            : undefined,
        transferInAmount: transactionToEdit.transferInAmount,
        budgetId: transactionToEdit.budgetId || (transactionToEdit.type === 'income' ? 'none' : 'auto'),
        date: transactionToEdit.date,
        note: transactionToEdit.note || '',
      });
      setSelectedTagIds(transactionToEdit.tagIds || []);
      prevIsOpenRef.current = true;
      return;
    }

    // 2. 新增模式處理：僅在開啟瞬間（或從編輯切換為新增時）執行單次初始化
    if (hasInitializedAddRef.current) {
      prevIsOpenRef.current = true;
      return;
    }

    hasInitializedAddRef.current = true;
    loadedEditIdRef.current = null;

    const today = getLocalDateString();
    setType(initialType);
    setSelectedTagIds([]);
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
    setIsUserSelectedCat(Boolean(initialCategoryId));
    prevIsOpenRef.current = true;
  }, [
    isOpen,
    transactionToEditId,
    transactionToEdit,
    initialType,
    initialLoanType,
    initialContactId,
    initialToAccountId,
    initialAmount,
    initialAccountId,
    initialCategoryId,
    initialNote,
    transactions,
    contacts,
    allCategories,
    reset,
    setValue,
    t,
    onClose,
  ]);

  const handleTypeChange = (newType: TransactionType, newLoanType?: LoanType) => {
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
  const currentNote = watch('note') || '';

  const selectedAccount = useMemo(
    () => accounts?.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );
  const selectedFromAccount = useMemo(
    () => accounts?.find((a) => a.id === selectedFromAccountId),
    [accounts, selectedFromAccountId]
  );

  const loanWallet = useMemo(() => {
    if (type !== 'loan') return null;
    const walletId = loanType === 'lend' ? selectedFromAccountId : selectedToAccountId;
    return accounts?.find((a) => a.id === walletId);
  }, [type, loanType, selectedFromAccountId, selectedToAccountId, accounts]);

  const loanContact = useMemo(() => {
    if (type !== 'loan') return null;
    const contactId = loanType === 'lend' ? selectedToAccountId : selectedFromAccountId;
    return contacts?.find((c) => c.id === contactId) || null;
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
      return accounts?.find((a) => a.id === selectedToAccountId)?.currency || baseCurrency;
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

  const filteredCategories = useMemo(
    () => categories?.filter((c) => c.type === type) || [],
    [categories, type]
  );

  const parsedFeeAmount = type === 'transfer' && displayFeeAmount ? parseFloat(displayFeeAmount) || 0 : 0;
  const parsedAmount = parseFloat(displayAmount) || 0;
  const parsedAmountIn = parseFloat(displayAmountIn) || 0;

  const calculatedRate = useMemo(() => {
    if (parsedAmount > 0 && parsedAmountIn > 0) {
      return parsedAmountIn / parsedAmount;
    }
    return null;
  }, [parsedAmount, parsedAmountIn]);

  const transferDeductedAmount = parsedAmount + parsedFeeAmount;
  const transferReceivedAmount = isCrossCurrency ? parsedAmountIn : parsedAmount;
  const showTransferBubbles = type === 'transfer' && (parsedFeeAmount > 0 || isCrossCurrency);

  // 智慧分類推薦與備註預測 Hook
  const { frequentCategories, displayedPills, predictedResult } = useCategoryPrediction({
    currentNote,
    type,
    filteredCategories,
    transactions,
    isUserSelectedCat,
    selectedCategoryId,
    onApplyPredictedCategory: (catId) => {
      setValue('categoryId', catId, { shouldValidate: true });
      setIsCategoryWarning(false);
    },
  });

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

  // 帳戶預設自動填入
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0];

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
        const candidate =
          accounts.find((a) => a.id !== initialToAccountId && a.isDefault) ||
          accounts.find((a) => a.id !== initialToAccountId) ||
          defaultAcc;
        setValue('fromAccountId', candidate.id);
      }
      return;
    }

    if (type === 'loan') {
      const specificContact = initialContactId ? contacts?.find((c) => c.id === initialContactId) : undefined;
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
  }, [
    accounts,
    type,
    loanType,
    contacts,
    setValue,
    initialContactId,
    selectedAccountId,
    selectedFromAccountId,
    selectedToAccountId,
    initialToAccountId,
  ]);

  const onSubmit = async (data: FormValues) => {
    try {
      const rateToBase = getRate(fromCurrency, baseCurrency);
      const exchangeRate = rateToBase;

      if (type === 'transfer') {
        const feeAmount = parseFloat(displayFeeAmount) || 0;
        const transferAmount = data.amount;
        const transferInAmount = isCrossCurrency ? data.transferInAmount ?? transferAmount : transferAmount;
        const transferRate = isCrossCurrency && transferAmount > 0 ? transferInAmount / transferAmount : 1;
        const baseAmount = transferAmount * rateToBase;

        let feeCategoryId: string | undefined;
        if (feeAmount > 0) {
          let feeCat = categories?.find(
            (c) => c.type === 'expense' && (c.name === '手續費' || c.name === '手续费' || c.name.toLowerCase() === 'fee')
          );
          if (!feeCat) {
            feeCat = categories?.find(
              (c) =>
                c.type === 'expense' &&
                (c.name.includes('手續費') || c.name.includes('手续费') || c.name.toLowerCase().includes('fee'))
            );
          }
          if (!feeCat) {
            const newCat = await addCategory('手續費', 'expense');
            feeCategoryId = newCat.id;
          } else {
            feeCategoryId = feeCat.id;
          }
        }

        const splitGroupId = feeAmount > 0 ? transactionToEdit?.splitGroupId || uuidv4() : undefined;

        await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
          if (transactionToEdit) {
            if (transactionToEdit.splitGroupId) {
              const otherGroupTxs =
                transactions?.filter(
                  (t) => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id
                ) || [];
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
              tagIds: selectedTagIds,
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
                tagIds: selectedTagIds,
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
              tagIds: selectedTagIds,
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
                tagIds: selectedTagIds,
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
          const otherGroupTxs =
            transactions?.filter(
              (t) => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id
            ) || [];
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
          tagIds: selectedTagIds,
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
      const validSplits = type === 'expense' ? splits.filter((s) => s.amount > 0 && Boolean(s.contactId)) : [];
      const hasSplits = validSplits.length > 0;
      const isAdvance = hasSplits;

      // 多人分攤或部分代付分拆處理
      if (isAdvance) {
        const totalAdvanceOriginal = validSplits.reduce((sum, s) => sum + s.amount, 0);
        const selfExpenseOriginal = Math.max(0, Math.round((data.amount - totalAdvanceOriginal) * 100) / 100);
        const isMultiOrPartial = validSplits.length > 1 || (validSplits.length === 1 && selfExpenseOriginal > 0);

        if (isMultiOrPartial) {
          const splitGroupId = transactionToEdit?.splitGroupId || uuidv4();

          await db.transaction('rw', [db.transactions, db.balance_snapshots, db.accounts], async () => {
            if (transactionToEdit) {
              if (transactionToEdit.splitGroupId) {
                const oldGroupTxs =
                  transactions?.filter(
                    (t) => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId
                  ) || [];
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
                tagIds: selectedTagIds,
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
                category: 'advance',
                accountId: data.accountId!,
                toAccountId: s.contactId,
                splitGroupId,
                note: data.note,
                date: data.date,
                tagIds: selectedTagIds,
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
        category: isAdvance ? 'advance' : data.categoryId!,
        accountId: data.accountId!,
        toAccountId: isAdvance ? singleContactId : undefined,
        transferInAmount: undefined,
        budgetId: isAdvance ? undefined : data.budgetId,
        note: data.note,
        date: data.date,
        tagIds: selectedTagIds,
      };

      if (transactionToEdit) {
        if (transactionToEdit.splitGroupId) {
          const otherGroupTxs =
            transactions?.filter(
              (t) => !t.deleted && t.splitGroupId === transactionToEdit.splitGroupId && t.id !== transactionToEdit.id
            ) || [];
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

  // 邊緣右滑手勢返回
  const { handleTouchStart, handleTouchEnd, handleTouchCancel } = useEdgeSwipeBack({
    onSwipeBack: onClose,
    isDisabled: accountSelectConfig.open || isCatPickerOpen || isCatDialogOpen,
  });

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open, details) => {
          if (!open) {
            if (details?.reason === 'outside-press') {
              return; // 防止點擊外部關閉
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
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{transactionToEditId ? t('dashboard.edit', '編輯') : t('nav.add')}</DialogTitle>
          </DialogHeader>

          <div className="w-full min-h-full flex flex-col gap-2.5 sm:gap-3">
            {/* 1. 頂部型別選擇條 (TransactionTypeSelector) */}
            <TransactionTypeSelector
              type={type}
              loanType={loanType}
              walletCount={walletCount}
              onTypeChange={handleTypeChange}
              onClose={onClose}
            />

            {/* 2. 金額與帳戶卡片區 (Hero Section) */}
            <div className="w-full flex-1 flex flex-col items-center justify-center [justify-content:safe_center] my-auto py-1 sm:py-2">
              {(type === 'expense' || type === 'income') && (
                <AmountHeroSection
                  selectedAccountId={selectedAccountId}
                  accounts={accounts}
                  selectedCurrency={selectedCurrency}
                  displayAmount={displayAmount}
                  isTyping={isTyping}
                  amountError={errors.amount?.message}
                  accountError={errors.accountId?.message}
                  onOpenAccountSelect={() => {
                    setAccountSelectConfig({
                      open: true,
                      title: t('accounts.selectAccountTitle', '選擇帳戶'),
                      selectedAccountId: selectedAccountId || undefined,
                      filterType: 'wallet',
                      onSelect: (acc) => setValue('accountId', acc.id),
                    });
                  }}
                />
              )}

              {type === 'transfer' && (
                <TransferDualCards
                  focusedField={focusedField}
                  previousAmountField={previousAmountField}
                  setFocusedField={setFocusedField}
                  setPreviousAmountField={setPreviousAmountField}
                  isCrossCurrency={isCrossCurrency}
                  fromCurrency={fromCurrency}
                  toCurrency={toCurrency}
                  displayAmount={displayAmount}
                  displayAmountIn={displayAmountIn}
                  displayFeeAmount={displayFeeAmount}
                  parsedFeeAmount={parsedFeeAmount}
                  parsedAmount={parsedAmount}
                  parsedAmountIn={parsedAmountIn}
                  calculatedRate={calculatedRate}
                  transferDeductedAmount={transferDeductedAmount}
                  transferReceivedAmount={transferReceivedAmount}
                  showTransferBubbles={showTransferBubbles}
                  isTyping={isTyping}
                  selectedFromAccountId={selectedFromAccountId}
                  selectedToAccountId={selectedToAccountId}
                  accounts={accounts}
                  amountError={errors.amount?.message}
                  fromAccountError={errors.fromAccountId?.message}
                  toAccountError={errors.toAccountId?.message}
                  onOpenFromAccountSelect={() => {
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
                  onOpenToAccountSelect={() => {
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
                  onSwapAccounts={handleSwapTransferAccounts}
                />
              )}

              {type === 'loan' && (
                <LoanDualCards
                  loanType={loanType}
                  focusedField={focusedField}
                  setFocusedField={setFocusedField}
                  isCrossCurrency={isCrossCurrency}
                  fromCurrency={fromCurrency}
                  toCurrency={toCurrency}
                  displayAmount={displayAmount}
                  displayAmountIn={displayAmountIn}
                  parsedAmount={parsedAmount}
                  parsedAmountIn={parsedAmountIn}
                  calculatedRate={calculatedRate}
                  isGift={isGift}
                  isTyping={isTyping}
                  selectedFromAccountId={selectedFromAccountId}
                  selectedToAccountId={selectedToAccountId}
                  accounts={accounts}
                  loanContact={loanContact}
                  amountError={errors.amount?.message}
                  fromAccountError={errors.fromAccountId?.message}
                  toAccountError={errors.toAccountId?.message}
                  onOpenFromAccountSelect={() => {
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
                  onOpenToAccountSelect={() => {
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
                  onToggleLoanType={toggleLoanType}
                />
              )}
            </div>

            {/* 3. 下方控制區：分類 + 備註 + 鍵盤 */}
            <div className="w-full flex flex-col gap-2 shrink-0 mt-auto">
              {(type === 'expense' || type === 'income') && (
                <CategoryChipsRow
                  filteredCategories={filteredCategories}
                  displayedPills={displayedPills}
                  selectedCategoryId={selectedCategoryId}
                  predictedCategoryId={predictedResult?.category.id}
                  isCategoryWarning={isCategoryWarning}
                  onSelectCategory={(catId) => {
                    setIsUserSelectedCat(true);
                    setValue('categoryId', catId, { shouldValidate: true });
                    setIsCategoryWarning(false);
                  }}
                  onOpenMoreCategories={() => {
                    setIsCatPickerOpen(true);
                    setIsCategoryWarning(false);
                  }}
                  onOpenCreateCategory={() => {
                    setIsCatDialogOpen(true);
                    setIsCategoryWarning(false);
                  }}
                />
              )}

              <InlineNoteInput
                note={currentNote}
                onChangeNote={(val) => {
                  setValue('note', val, { shouldDirty: true });
                }}
                type={type}
                selectedCategoryId={selectedCategoryId}
                selectedTagIds={selectedTagIds}
                selectedTagNames={selectedTagNames}
                allCategories={allCategories}
                categories={categories}
                transactions={transactions}
                onOpenTagPicker={() => setIsTagPickerOpen(true)}
                onSelectCategoryFromSuggestion={(catId) => {
                  setValue('categoryId', catId, { shouldValidate: true });
                  setIsUserSelectedCat(true);
                  setIsCategoryWarning(false);
                }}
              />

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
                  onOpenSplitDialog={() => setIsSplitDialogOpen(true)}
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
                  activeAmountField={focusedField === 'fee' ? null : focusedField === 'in' ? 'in' : 'out'}
                  onSelectAmountField={(field) => {
                    setPreviousAmountField(field);
                    setFocusedField(field);
                  }}
                  fromCurrency={fromCurrency}
                  toCurrency={toCurrency}
                  isGift={isGift}
                  onToggleGift={() => setIsGift((prev) => !prev)}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 次級彈窗層次堆疊 (平級 Sibling Portal 宣告，確保遮罩防護與獨立渲染) */}
      <CategoryPickerQuickDialog
        open={isCatPickerOpen}
        onOpenChange={setIsCatPickerOpen}
        type={type as 'expense' | 'income'}
        filteredCategories={filteredCategories}
        frequentCategories={frequentCategories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={(catId) => {
          setIsUserSelectedCat(true);
          setValue('categoryId', catId, { shouldValidate: true });
        }}
        onRequestCreateCategory={() => setIsCatDialogOpen(true)}
      />

      <AddCategoryQuickDialog
        open={isCatDialogOpen}
        onOpenChange={setIsCatDialogOpen}
        type={type as 'expense' | 'income'}
        onAddCategory={async (categoryName) => {
          const newCat = await addCategory(categoryName, type as 'expense' | 'income');
          setValue('categoryId', newCat.id, { shouldValidate: true });
          setIsUserSelectedCat(true);
        }}
      />

      <AccountSelectDialog
        open={accountSelectConfig.open}
        onOpenChange={(open) => setAccountSelectConfig((prev) => ({ ...prev, open }))}
        title={accountSelectConfig.title}
        selectedAccountId={accountSelectConfig.selectedAccountId}
        disabledAccountIds={accountSelectConfig.disabledAccountIds}
        disabledReason={accountSelectConfig.disabledReason}
        filterType={accountSelectConfig.filterType}
        onSelectAccount={(acc) => {
          accountSelectConfig.onSelect(acc);
        }}
      />

      <SplitAdvanceDialog
        open={isSplitDialogOpen}
        onOpenChange={setIsSplitDialogOpen}
        totalAmount={parseFloat(displayAmount) || 0}
        currencySymbol={getCurrencySymbol(fromCurrency)}
        splits={splits}
        onConfirm={(newSplits) => {
          setSplits(newSplits);
        }}
        contacts={contacts}
      />

      <TagPickerQuickDialog
        open={isTagPickerOpen}
        onOpenChange={setIsTagPickerOpen}
        selectedTagIds={selectedTagIds}
        onToggleTag={(tagId) => {
          setSelectedTagIds((prev) =>
            prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
          );
        }}
        tags={tags}
        onAddTag={addTag}
        onTagCreated={(newTagId) => {
          setSelectedTagIds((prev) => (prev.includes(newTagId) ? prev : [...prev, newTagId]));
        }}
      />
    </>
  );
}
