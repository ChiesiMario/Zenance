import { useParams, useNavigate } from 'react-router-dom';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useCategories } from '@/hooks/useCategories';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Edit, Trash2, ArchiveRestore, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { COMMON_CURRENCIES } from '@/hooks/useExchangeRates';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { AmountDisplay } from '@/components/ui/AmountDisplay';

export default function AccountDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { accounts, contacts, updateAccount, deleteAccount, archiveAccount } = useAccounts();
  const { transactions, addTransaction } = useTransactions();
  const { allCategories, getOrCreateSystemBalanceAdjustmentCategory } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  
  const account = accounts?.find(a => a.id === id);
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('cash');
  const [editCurrency, setEditCurrency] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  
  const [isAdjustBalanceDialogOpen, setIsAdjustBalanceDialogOpen] = useState(false);
  const [newBalanceStr, setNewBalanceStr] = useState('');
  
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
        <Button variant="outline" onClick={() => navigate('/accounts')}>Go back</Button>
      </div>
    );
  }

  const accountTransactions = useMemo(() => {
    return transactions?.filter(tx => tx.accountId === id || tx.toAccountId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];
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
      setNewBalanceStr(balance.toString());
    }
  }, [isAdjustBalanceDialogOpen, balance]);

  const parsedNewBalance = parseFloat(newBalanceStr) || 0;
  const balanceDiff = parsedNewBalance - balance;

  const handleAdjustBalance = async () => {
    if (!id || balanceDiff === 0) {
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
        originalCurrency: account?.currency || activeLedger?.baseCurrency || 'CNY',
        exchangeRate: 1,
        type: diffType,
        category: category.id,
        accountId: id,
        date: new Date().toISOString().split('T')[0],
        note: t('accounts.balanceAdjustmentNote')
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

  const getCategoryName = (tx: any) => {
    if (tx.type === 'transfer') return t('add.transfer');
    if (tx.type === 'loan') {
      const isLent = contacts?.some(c => c.id === tx.toAccountId);
      return isLent ? t('add.lent') : t('add.borrowed');
    }
    return allCategories?.find(c => c.id === tx.category)?.name || tx.category;
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
    <div className="animate-in fade-in duration-500 w-full space-y-6 pb-8">
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

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-4 border-b border-border bg-muted/20">
          <h3 className="text-sm font-medium">{t('dashboard.recentTransactions')}</h3>
        </div>
        <div className="divide-y divide-border">
          {accountTransactions.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noActivity')}
            </div>
          )}
          {accountTransactions.map(t => (
            <button 
              key={t.id} 
              onClick={() => setSelectedTransactionId(t.id)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">{getCategoryName(t)}</span>
                {t.note && (
                  <p className="text-sm text-muted-foreground truncate">
                    {t.note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <AmountDisplay 
                  amount={(t.type === 'transfer' || t.type === 'loan') && t.accountId === id ? -t.amount : ((t.type === 'transfer' || t.type === 'loan') && t.toAccountId === id ? (t.transferInAmount ?? t.amount) : t.amount)} 
                  originalCurrency={t.originalCurrency} 
                  baseCurrency={activeLedger?.baseCurrency} 
                  type={t.type as any} 
                  className={cn("text-base", 
                    (t.type === 'income' || (t.type === 'transfer' && t.toAccountId === id) || (t.type === 'loan' && t.toAccountId === id)) ? 'text-primary' : 
                    (t.type === 'expense' || ((t.type === 'transfer' || t.type === 'loan') && t.accountId === id)) ? 'text-muted-foreground' : undefined
                  )}
                  showSign={true}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[350px] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-center">{t('accounts.editAccount', 'Edit Account')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium">{t('accounts.accountName')}</label>
              <Input 
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('accounts.accountGroup')}</label>
                <Select value={editGroup} onValueChange={(val) => { if (val) setEditGroup(val); }}>
                  <SelectTrigger>
                    <SelectValue>
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
              
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('setup.currency', 'Currency')}</label>
                <Select disabled={hasTransactions} value={editCurrency || activeLedger?.baseCurrency || 'CNY'} onValueChange={(val) => { if (val) setEditCurrency(val); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deleteError && (
              <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-md">
                {deleteError}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border">
              <Button variant="outline" className="w-full justify-center text-muted-foreground hover:text-foreground" onClick={handleArchive}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                {t('accounts.archiveAccount', 'Archive Account')}
              </Button>
              <Button disabled={hasTransactions} variant="outline" className="w-full justify-center text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('accounts.deleteAccount', 'Delete Account')}
              </Button>
            </div>
            
            {hasTransactions && (
              <div className="text-center !mt-3">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {t('accounts.cannotEditCurrencyHasTransactions', 'Currency and Account Deletion are disabled when there are existing transactions.')}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('common.cancel', 'Cancel')}
            </DialogClose>
            <Button onClick={handleUpdate} disabled={!editName.trim()}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isAdjustBalanceDialogOpen} onOpenChange={setIsAdjustBalanceDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-center">{t('accounts.adjustBalance')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-muted-foreground">{t('accounts.currentAmount')}</label>
              <div className="text-2xl font-mono opacity-50">
                <AmountDisplay amount={balance} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium">{t('accounts.newAmount')}</label>
              <Input 
                type="number"
                step="any"
                value={newBalanceStr}
                onChange={(e) => setNewBalanceStr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdjustBalance()}
              />
            </div>
            
            <div className="space-y-1 pt-2 border-t border-border">
              <label className="block text-sm font-medium text-muted-foreground">{t('accounts.difference')}</label>
              <div className={cn("text-xl font-mono", balanceDiff > 0 ? "text-primary" : balanceDiff < 0 ? "text-destructive" : "text-muted-foreground")}>
                <AmountDisplay amount={balanceDiff} baseCurrency={activeLedger?.baseCurrency} type={balanceDiff > 0 ? 'income' : balanceDiff < 0 ? 'expense' : 'neutral'} showSign={true} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button onClick={handleAdjustBalance}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <TransactionDetailsDialog 
        transactionId={selectedTransactionId} 
        onClose={() => setSelectedTransactionId(null)} 
      />
    </div>
  );
}
