import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus, Wallet, ChevronDown, Check, RefreshCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMON_CURRENCIES } from '@/hooks/useExchangeRates';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { AmountDisplay } from '@/components/ui/AmountDisplay';

export default function Accounts() {
  const { t } = useTranslation();
  const { accounts, wallets, archivedWallets, contacts, addAccount, unarchiveAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [currentView, setCurrentView] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountInitialBalance, setNewAccountInitialBalance] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState('');
  const [newAccountGroup, setNewAccountGroup] = useState('cash');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const selectedCurrency = newAccountCurrency || activeLedger?.baseCurrency || 'CNY';

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!accounts || !transactions) return balances;

    // Initialize balances
    accounts.forEach(a => {
      balances[a.id] = a.initialBalance || 0;
    });

    transactions.forEach(tx => {
      if (tx.deleted) return;
      if (tx.type === 'income') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
      } else if (tx.type === 'expense') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
        // If this expense is a pending reimbursement, the contact holds it as a receivable
        if (tx.reimbursementStatus === 'pending' && tx.reimbursementContactId && balances[tx.reimbursementContactId] !== undefined) {
          balances[tx.reimbursementContactId] += tx.amount;
        }
      } else if (tx.type === 'transfer' || tx.type === 'loan') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
        if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += (tx.transferInAmount ?? tx.amount);
      }
    });

    return balances;
  }, [accounts, transactions]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, typeof wallets> = {
      cash: [],
      debit: [],
      credit: [],
      credit_pay: [],
      investment: [],
      other: [],
    };

    const activeAccounts = wallets?.filter(a => a.ledgerId === activeLedgerId && !a.archived) || [];
    
    activeAccounts.forEach(w => {
      const g = w.group || 'cash';
      if (!groups[g]) groups[g] = [];
      groups[g].push(w);
    });
    return groups;
  }, [wallets, activeLedgerId]);
  
  const GROUP_ORDER = ['cash', 'debit', 'credit', 'credit_pay', 'investment', 'other'];
  const GROUP_I18N_KEYS: Record<string, string> = {
    cash: 'groupCash',
    debit: 'groupDebit',
    credit: 'groupCredit',
    credit_pay: 'groupCreditPay',
    investment: 'groupInvestment',
    other: 'groupOther'
  };

  const { totalWallets, totalLoans, netWorth } = useMemo(() => {
    let wallets = 0;
    let loans = 0;
    Object.keys(accountBalances).forEach(id => {
      const isContact = contacts?.some(c => c.id === id);
      if (isContact) {
        loans += accountBalances[id];
      } else {
        wallets += accountBalances[id];
      }
    });
    return {
      totalWallets: wallets,
      totalLoans: loans,
      netWorth: wallets + loans,
    };
  }, [accountBalances, contacts]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return;
    const balanceNum = parseFloat(newAccountInitialBalance);
    await addAccount(newAccountName.trim(), 'wallet', isNaN(balanceNum) ? 0 : balanceNum, selectedCurrency, newAccountGroup);
    setNewAccountName('');
    setNewAccountInitialBalance('');
    setNewAccountCurrency('');
    setNewAccountGroup('cash');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center text-xl font-semibold tracking-tight hover:bg-muted/50 data-[state=open]:bg-muted/50 rounded-md px-2 -ml-2 py-1 outline-none cursor-pointer">
            <span>
              {currentView === 'archived' ? t('accounts.archived', '已歸檔') : t('accounts.accounts')}
            </span>
            <ChevronDown className="ml-1 h-4 w-4 opacity-50 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[140px]">
            <DropdownMenuItem 
              onClick={() => setCurrentView('active')}
              className="justify-between cursor-pointer"
            >
              <span>{t('accounts.accounts')}</span>
              {currentView === 'active' && <Check className="h-4 w-4 text-foreground shrink-0" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setCurrentView('archived')}
              className="justify-between cursor-pointer"
            >
              <span>{t('accounts.archived', '已歸檔')}</span>
              {currentView === 'archived' && <Check className="h-4 w-4 text-foreground shrink-0" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {currentView === 'active' ? (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" />}>
              <Plus className="h-5 w-5" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[300px]">
              <DialogHeader>
                <DialogTitle>{t('accounts.addAccount')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.accountName')}</label>
                  <Input 
                    placeholder={t('accounts.namePlaceholder')} 
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.accountGroup')}</label>
                  <Select value={newAccountGroup} onValueChange={(val) => { if (val) setNewAccountGroup(val); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {t(`accounts.${GROUP_I18N_KEYS[newAccountGroup]}` as any)}
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
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.initialBalance')}</label>
                  <div className="flex">
                    <Select value={selectedCurrency} onValueChange={(val) => { if (val) setNewAccountCurrency(val); }}>
                      <SelectTrigger className="w-[90px] rounded-r-none border-r-0 focus:ring-0 focus:ring-offset-0 bg-muted/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_CURRENCIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="rounded-l-none font-mono flex-1 min-w-0"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newAccountInitialBalance}
                      onChange={(e) => setNewAccountInitialBalance(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" type="button" />}>
                  {t('accounts.cancel')}
                </DialogClose>
                <Button onClick={handleAddAccount} disabled={!newAccountName.trim()} className="cursor-pointer">
                  {t('accounts.add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      {currentView === 'active' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
          <div className="p-6 border-b border-border flex flex-col items-start justify-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('accounts.netWorth')}</p>
            <div className="text-5xl font-mono tracking-tighter font-medium text-foreground">
              <AmountDisplay amount={netWorth} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-5 border-r border-border flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.totalWallets')}</p>
              <p className={cn("text-2xl font-mono tracking-tight font-medium", totalWallets >= 0 ? "text-primary" : "text-destructive")}>
                <AmountDisplay amount={totalWallets} baseCurrency={activeLedger?.baseCurrency} type={totalWallets >= 0 ? "income" : "expense"} />
              </p>
            </div>
            <div className="p-5 flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.netLoans')}</p>
              <p className={cn("text-2xl font-mono tracking-tight font-medium", totalLoans >= 0 ? "text-primary" : "text-destructive")}>
                <AmountDisplay amount={totalLoans} baseCurrency={activeLedger?.baseCurrency} type={totalLoans >= 0 ? "income" : "expense"} />
              </p>
            </div>
          </div>
        </div>
      )}

      {currentView === 'active' ? (
        <div className="space-y-4">
          {(!wallets || wallets.length === 0) && (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Wallet className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('accounts.noAccounts')}</p>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsDialogOpen(true)}
                className="cursor-pointer mx-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                title={t('accounts.addAccount')}
                aria-label={t('accounts.addAccount')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {GROUP_ORDER.map(groupId => {
            const groupAccounts = groupedAccounts[groupId];
            if (!groupAccounts || groupAccounts.length === 0) return null;
            
            const groupTotal = groupAccounts.reduce((sum, account) => sum + (accountBalances[account.id] || 0), 0);
            
            return (
              <div key={groupId} className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col">
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                  <span>{t(`accounts.${GROUP_I18N_KEYS[groupId]}` as any)}</span>
                  <AmountDisplay 
                    amount={groupTotal} 
                    baseCurrency={activeLedger?.baseCurrency} 
                    type="neutral" 
                    className="opacity-50 font-normal"
                  />
                </div>
                <div className="divide-y divide-border">
                  {groupAccounts.map(account => (
                    <Link key={account.id} to={`/accounts/${account.id}`} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium leading-none">{account.name}</span>
                          {account.isDefault && (
                            <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
                              {t('accounts.default')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {account.currency || activeLedger?.baseCurrency || 'CNY'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <AmountDisplay 
                          amount={accountBalances[account.id] || 0} 
                          baseCurrency={account.currency || activeLedger?.baseCurrency} 
                          type="neutral" 
                          className={cn("text-base", (accountBalances[account.id] || 0) < 0 ? 'text-destructive' : 'text-foreground')}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {(!archivedWallets || archivedWallets.length === 0) ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Wallet className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('accounts.noArchivedAccounts', '目前沒有任何已歸檔帳戶')}</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
              <div className="divide-y divide-border">
                {archivedWallets.map(account => (
                  <div key={account.id} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
                    <Link to={`/accounts/${account.id}`} className="flex flex-col gap-1 flex-1 min-w-0 mr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium leading-none text-muted-foreground hover:underline cursor-pointer">{account.name}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
                          {t('accounts.archived', '已歸檔')}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {account.currency || activeLedger?.baseCurrency || 'CNY'}
                      </span>
                    </Link>
                    <div className="flex items-center gap-3">
                      <AmountDisplay 
                        amount={accountBalances[account.id] || 0} 
                        baseCurrency={account.currency || activeLedger?.baseCurrency} 
                        type="neutral" 
                        className="text-base text-muted-foreground"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-primary opacity-90 hover:opacity-100 cursor-pointer"
                        onClick={() => unarchiveAccount(account.id)}
                      >
                        <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                        {t('settings.unarchive', '取消歸檔')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
