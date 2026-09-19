import { useParams, useNavigate } from 'react-router-dom';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useCategories } from '@/hooks/useCategories';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Edit, Trash2, ArchiveRestore, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect, useRef } from 'react';
import { cn, getCurrencySymbol, sortTransactionsDesc } from '@/lib/utils';
import { COMMON_CURRENCIES } from '@/hooks/useExchangeRates';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';

export default function AccountDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { accounts, updateAccount, deleteAccount, archiveAccount } = useAccounts();
  const { transactions, addTransaction } = useTransactions();
  const { getOrCreateSystemBalanceAdjustmentCategory } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  
  const account = accounts?.find(a => a.id === id);
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currency = account?.currency || activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(currency);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('cash');
  const [editCurrency, setEditCurrency] = useState('');
  const [deleteError, setDeleteError] = useState('');
  
  const [isAdjustBalanceDialogOpen, setIsAdjustBalanceDialogOpen] = useState(false);
  const [newBalanceStr, setNewBalanceStr] = useState('');
  const adjustInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (account) {
      setEditName(account.name);
      setEditGroup(account.group || 'cash');
      setEditCurrency(account.currency || '');
      setDeleteError('');
    }
  }, [account, isEditDialogOpen]);

  if (!account && accounts && accounts.length > 0) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <p>{t('accounts.accountNotFound', 'Account not found.')}</p>
        <Button variant="outline" onClick={() => navigate('/accounts')}>{t('common.back')}</Button>
      </div>
    );
  }

  const accountTransactions = useMemo(() => {
    const list = transactions?.filter(tx => tx.accountId === id || tx.toAccountId === id) || [];
    return sortTransactionsDesc(list);
  }, [transactions, id]);

  const hasTransactions = accountTransactions.length > 0;

  const { balance, totalIncome, totalExpense } = useMemo(() => {
    let bal = account?.initialBalance || 0;
    let income = 0;
    let expense = 0;
    
    accountTransactions.forEach(tx => {
      if (tx.type === 'income' && tx.accountId === id) {
        bal += tx.amount;
        income += tx.amount;
      }
      if (tx.type === 'expense' && tx.accountId === id) {
        bal -= tx.amount;
        expense += tx.amount;
      }
      if (tx.type === 'transfer' || tx.type === 'loan') {
        if (tx.accountId === id) {
          bal -= tx.amount;
          expense += tx.amount;
        }
        if (tx.toAccountId === id) {
          const inAmount = tx.transferInAmount ?? tx.amount;
          bal += inAmount;
          income += inAmount;
        }
      }
    });
    return { balance: bal, totalIncome: income, totalExpense: expense };
  }, [accountTransactions, account?.initialBalance, id]);

  useEffect(() => {
    if (isAdjustBalanceDialogOpen) {
      const initialStr = balance.toString();
      setNewBalanceStr(initialStr);
      // 聚焦並將游標停留在末尾，不全選數字
      setTimeout(() => {
        if (adjustInputRef.current) {
          adjustInputRef.current.focus();
          const len = adjustInputRef.current.value.length;
          adjustInputRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isAdjustBalanceDialogOpen, balance]);

  const parsedNewBalance = parseFloat(newBalanceStr) || 0;
  const balanceDiff = parsedNewBalance - balance;

  const handleAdjustBalance = async () => {
    if (!id || balanceDiff === 0 || !newBalanceStr.trim()) {
      setIsAdjustBalanceDialogOpen(false);
      return;
    }
    
    const diffType = balanceDiff > 0 ? 'income' : 'expense';
    const catName = t('accounts.balanceAdjustment');
    
    const category = await getOrCreateSystemBalanceAdjustmentCategory(diffType, catName);
    if (category) {
      await addTransaction({
        amount: Math.abs(balanceDiff),
        originalAmount: Math.abs(balanceDiff),
        originalCurrency: currency,
        exchangeRate: 1,
        type: diffType,
        category: category.id,
        accountId: id,
        date: new Date().toISOString().split('T')[0],
        note: ''
      });
    }
    setIsAdjustBalanceDialogOpen(false);
  };

  const handleUpdate = async () => {
    if (!editName.trim() || !id) return;
    await updateAccount(id, {
      name: editName.trim(),
      group: editGroup,
      currency: editCurrency
    });
    setIsEditDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const res = await deleteAccount(id);
    if (!res.success) {
      setDeleteError(res.reason === 'has_transactions' ? t('accounts.cannotDeleteHasTransactions', 'Cannot delete account with existing transactions. You can archive it instead.') : t('common.error'));
    } else {
      navigate('/accounts');
    }
  };
  
  const handleArchive = async () => {
    if (!id) return;
    await archiveAccount(id);
    navigate('/accounts');
  };


  const GROUP_I18N_KEYS: Record<string, string> = {
    cash: 'groupCash',
    debit: 'groupDebit',
    credit: 'groupCredit',
    credit_pay: 'groupCreditPay',
    investment: 'groupInvestment',
    other: 'groupOther'
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate('/accounts')} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">{account?.name}</h2>
        <div className="w-8"></div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-8 border-b border-border flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('accounts.balance')}</p>
          <div className={cn("text-6xl font-mono tracking-tighter font-medium break-all px-4", balance < 0 ? 'text-destructive' : 'text-foreground')}>
            <AmountDisplay amount={balance} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.income')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium text-foreground">
              <AmountDisplay amount={totalIncome} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.expense')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium text-foreground">
              <AmountDisplay amount={totalExpense} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </p>
          </div>
        </div>
      </div>

      <div className="flex border border-border rounded-lg overflow-hidden bg-card text-card-foreground divide-x divide-border">
        <button 
          onClick={() => setIsEditDialogOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Edit className="h-4 w-4 text-muted-foreground" />
          <span>{t('accounts.editAccount', 'Edit Account')}</span>
        </button>
        <button 
          onClick={() => setIsAdjustBalanceDialogOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span>{t('accounts.adjustBalance')}</span>
        </button>
      </div>

      <GroupedTransactionList
        transactions={accountTransactions}
        contextAccountId={id}
        title={
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('dashboard.recentTransactions')}
            </h3>
            <span className="text-xs font-mono text-muted-foreground">
              {t('reimbursements.items', { count: accountTransactions.length })}
            </span>
          </div>
        }
      />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-center">{t('accounts.editAccount')}</DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-5">
            {/* 無邊界大字體名稱輸入區 */}
            <div className="flex flex-col items-center justify-center pt-2 pb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                {t('accounts.accountName')}
              </span>
              <input 
                type="text"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && editName.trim() && handleUpdate()}
                placeholder={t('accounts.namePlaceholder')}
                className="w-full text-center text-3xl font-bold tracking-tight bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Vercel Usage 風格屬性清單卡片 */}
            <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
              {/* 帳戶分類 */}
              <div className="flex items-center justify-between p-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t('accounts.accountGroup')}
                </span>
                <Select value={editGroup} onValueChange={(val) => { if (val) setEditGroup(val); }}>
                  <SelectTrigger className="!h-auto !py-0 !px-0 !border-none !bg-transparent shadow-none focus-visible:border-none focus-visible:ring-0 text-sm font-medium justify-end gap-1.5 cursor-pointer">
                    <SelectValue className="flex-none text-right">
                      {t(`accounts.${GROUP_I18N_KEYS[editGroup]}` as any)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('accounts.groupCash')}</SelectItem>
                    <SelectItem value="debit">{t('accounts.groupDebit')}</SelectItem>
                    <SelectItem value="credit">{t('accounts.groupCredit')}</SelectItem>
                    <SelectItem value="credit_pay">{t('accounts.groupCreditPay')}</SelectItem>
                    <SelectItem value="investment">{t('accounts.groupInvestment')}</SelectItem>
                    <SelectItem value="other">{t('accounts.groupOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* 預設貨幣 */}
              <div className="flex items-center justify-between p-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t('accounts.currency')}
                </span>
                <Select disabled={hasTransactions} value={editCurrency || activeLedger?.baseCurrency || 'CNY'} onValueChange={(val) => { if (val) setEditCurrency(val); }}>
                  <SelectTrigger className="!h-auto !py-0 !px-0 !border-none !bg-transparent shadow-none focus-visible:border-none focus-visible:ring-0 text-sm font-mono font-medium text-right justify-end gap-1.5 disabled:opacity-50 cursor-pointer">
                    <SelectValue className="flex-none text-right" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasTransactions && (
              <p className="text-[11px] text-muted-foreground text-center leading-normal px-2">
                {t('accounts.cannotEditCurrencyHasTransactions')}
              </p>
            )}

            {deleteError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-md text-center">
                {deleteError}
              </div>
            )}
            
            {/* 幽靈輔助操作（歸檔 · 刪除） */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleArchive}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                <span>{t('accounts.archiveAccount')}</span>
              </button>
              
              <span className="text-border select-none">·</span>

              <button
                type="button"
                onClick={handleDelete}
                disabled={hasTransactions}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('accounts.deleteAccount')}</span>
              </button>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:gap-2 pt-2">
            <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button onClick={handleUpdate} disabled={!editName.trim()} className="cursor-pointer">
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isAdjustBalanceDialogOpen} onOpenChange={setIsAdjustBalanceDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-center">{t('accounts.adjustBalance')}</DialogTitle>
          </DialogHeader>
          
          <div className="py-2 space-y-6">
            {/* 無邊界大字體金額輸入區 */}
            <div className="flex flex-col items-center justify-center pt-2 pb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
                {t('accounts.newAmount')}
              </span>
              <div className="inline-flex items-baseline justify-center gap-1.5 max-w-full">
                <span className="text-2xl sm:text-3xl font-mono font-medium text-muted-foreground select-none">
                  {currencySymbol}
                </span>
                <input
                  ref={adjustInputRef}
                  type="text"
                  inputMode="decimal"
                  value={newBalanceStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^-?\d*\.?\d*$/.test(val)) {
                      setNewBalanceStr(val);
                    }
                  }}
                  onFocus={(e) => {
                    const len = e.target.value.length;
                    e.target.setSelectionRange(len, len);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && balanceDiff !== 0 && handleAdjustBalance()}
                  style={{ width: `${Math.max(1, newBalanceStr.length)}ch` }}
                  className="min-w-[1ch] max-w-[220px] text-left text-4xl sm:text-5xl font-mono font-bold tracking-tight bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-foreground p-0"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Vercel Usage 風格對比清單卡片 */}
            <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t('accounts.currentAmount')}
                </span>
                <span className="text-sm font-mono text-foreground font-medium">
                  <AmountDisplay amount={balance} baseCurrency={currency} type="neutral" />
                </span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t('accounts.difference')}
                </span>
                <div className="flex items-center">
                  {balanceDiff === 0 ? (
                    <span className="text-sm font-mono text-muted-foreground">
                      {t('accounts.noDifference')}
                    </span>
                  ) : (
                    <AmountDisplay 
                      amount={balanceDiff} 
                      baseCurrency={currency} 
                      type={balanceDiff > 0 ? 'income' : 'expense'} 
                      showSign={true} 
                      className={cn("text-sm", balanceDiff < 0 && "text-destructive")}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:gap-2">
            <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button 
              onClick={handleAdjustBalance}
              disabled={balanceDiff === 0 || !newBalanceStr.trim()}
              className="cursor-pointer"
            >
              {t('accounts.confirmAdjust')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}
