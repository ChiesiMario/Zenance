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
import { cn, getCurrencySymbol } from '@/lib/utils';

export default function Accounts() {
  const { t } = useTranslation();
  const { accounts, wallets, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'USD');

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!accounts || !transactions) return balances;

    // Initialize balances
    accounts.forEach(a => {
      balances[a.id] = 0;
    });

    transactions.forEach(tx => {
      if (tx.type === 'income') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
      } else if (tx.type === 'expense') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
      } else if (tx.type === 'transfer') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
        if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += tx.amount;
      }
    });

    return balances;
  }, [accounts, transactions]);

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
    await addAccount(newAccountName.trim());
    setNewAccountName('');
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('accounts.addAccount')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input 
                placeholder={t('accounts.namePlaceholder')} 
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
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

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {(!wallets || wallets.length === 0) && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No accounts found.
            </div>
          )}
          
          {wallets?.map(account => (
            <div key={account.id} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium leading-none">{account.name}</span>
                  {account.isDefault && (
                    <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
                      {t('accounts.default')}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{t('accounts.balance')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("text-base font-mono font-medium", (accountBalances[account.id] || 0) < 0 ? 'text-destructive' : 'text-foreground')}>
                  {currencySymbol}{(accountBalances[account.id] || 0).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
