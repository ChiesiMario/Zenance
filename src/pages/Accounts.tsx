import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMON_CURRENCIES } from '@/hooks/useExchangeRates';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { Link } from 'react-router-dom';

export default function Accounts() {
  const { t } = useTranslation();
  const { accounts, wallets, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountInitialBalance, setNewAccountInitialBalance] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState('');
  const [newAccountGroup, setNewAccountGroup] = useState('cash');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'USD');
  const selectedCurrency = newAccountCurrency || activeLedger?.baseCurrency || 'CNY';

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!accounts || !transactions) return balances;

    // Initialize balances
    accounts.forEach(a => {
      balances[a.id] = a.initialBalance || 0;
    });

    transactions.forEach(tx => {
      if (tx.type === 'income') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
      } else if (tx.type === 'expense') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
      } else if (tx.type === 'transfer') {
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

  const { totalAssets, totalLiabilities, netWorth } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    Object.values(accountBalances).forEach(balance => {
      if (balance > 0) assets += balance;
      else if (balance < 0) liabilities += Math.abs(balance);
    });
    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
    };
  }, [accountBalances]);

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
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t('accounts.accounts')}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" />}>
            <Plus className="h-5 w-5" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-[300px] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-center">{t('accounts.addAccount')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('accounts.accountName')}</label>
                <Input 
                  placeholder={t('accounts.namePlaceholder')} 
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('accounts.accountGroup')}</label>
                <Select value={newAccountGroup} onValueChange={(val) => { if (val) setNewAccountGroup(val); }}>
                  <SelectTrigger>
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
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('accounts.initialBalance')}</label>
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
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t('accounts.cancel')}
              </DialogClose>
              <Button onClick={handleAddAccount} disabled={!newAccountName.trim()}>
                {t('accounts.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Asset Statistics Card */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-6 border-b border-border flex flex-col items-start justify-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('accounts.netWorth')}</p>
          <div className="text-5xl font-mono tracking-tighter font-medium text-foreground">
            {currencySymbol}{netWorth.toLocaleString()}
          </div>
        </div>
        <div className="grid grid-cols-2">
          <div className="p-5 border-r border-border flex flex-col">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.assets')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium text-primary">{currencySymbol}{totalAssets.toLocaleString()}</p>
          </div>
          <div className="p-5 flex flex-col">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.liabilities')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium text-destructive">{currencySymbol}{totalLiabilities.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {(!wallets || wallets.length === 0) && (
          <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground p-8 text-center text-sm text-muted-foreground">
            No accounts found.
          </div>
        )}
        
        {GROUP_ORDER.map(groupId => {
          const groupAccounts = groupedAccounts[groupId];
          if (!groupAccounts || groupAccounts.length === 0) return null;
          
          const groupTotal = groupAccounts.reduce((sum, account) => sum + (accountBalances[account.id] || 0), 0);
          
          return (
            <div key={groupId} className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
                <h3 className="text-sm font-medium">{t(`accounts.${GROUP_I18N_KEYS[groupId]}` as any)}</h3>
                <span className={cn("text-sm font-mono", groupTotal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  {currencySymbol}{groupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
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
                      <span className={cn("text-base font-mono font-medium", (accountBalances[account.id] || 0) < 0 ? 'text-destructive' : 'text-foreground')}>
                        {currencySymbol}{(accountBalances[account.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
