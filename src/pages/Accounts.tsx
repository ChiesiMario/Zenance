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
import { COMMON_CURRENCIES, useExchangeRates } from '@/hooks/useExchangeRates';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { calculateAccountBalances, convertAmount } from '@/lib/currency';

export default function Accounts() {
  const { t } = useTranslation();
  const { accounts, wallets, archivedWallets, contacts, addAccount, unarchiveAccount } = useAccounts();
  const { transactions } = useTransactions();
  const { getRate } = useExchangeRates();
  
  const [currentView, setCurrentView] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountInitialBalance, setNewAccountInitialBalance] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState('');
  const [newAccountGroup, setNewAccountGroup] = useState('cash');
  const [newCreditLimit, setNewCreditLimit] = useState('');
  const [newStatementDay, setNewStatementDay] = useState('');
  const [newDueDay, setNewDueDay] = useState('');
  const [newAccountExcludeFromStats, setNewAccountExcludeFromStats] = useState(false);

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const selectedCurrency = newAccountCurrency || baseCurrency;

  // 計算所有帳戶在各自原生幣種下的餘額
  const accountBalances = useMemo(() => {
    if (!accounts) return {};
    return calculateAccountBalances(accounts, transactions || [], getRate, baseCurrency);
  }, [accounts, transactions, getRate, baseCurrency]);

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

  // 判斷是否存在非基準幣種帳戶
  const hasForeignWallets = useMemo(() => {
    return (wallets || []).some(w => (w.currency || baseCurrency) !== baseCurrency);
  }, [wallets, baseCurrency]);

  const hasForeignLoans = useMemo(() => {
    return (contacts || []).some(c => (c.currency || baseCurrency) !== baseCurrency);
  }, [contacts, baseCurrency]);

  const hasForeignCurrency = hasForeignWallets || hasForeignLoans;

  // 將所有帳戶與往來的原生餘額，依即時匯率折算至基準幣種後統一累計（排除標記 excludeFromStats 的帳戶）
  const { totalWallets, totalLoans, netWorth } = useMemo(() => {
    let walletsSum = 0;
    let loansSum = 0;

    wallets?.forEach(w => {
      if (w.excludeFromStats) return;
      const raw = accountBalances[w.id] || 0;
      const curr = w.currency || baseCurrency;
      walletsSum += convertAmount(raw, curr, baseCurrency, getRate);
    });

    contacts?.forEach(c => {
      const raw = accountBalances[c.id] || 0;
      const curr = c.currency || baseCurrency;
      loansSum += convertAmount(raw, curr, baseCurrency, getRate);
    });

    return {
      totalWallets: Math.round(walletsSum * 100) / 100,
      totalLoans: Math.round(loansSum * 100) / 100,
      netWorth: Math.round((walletsSum + loansSum) * 100) / 100,
    };
  }, [wallets, contacts, accountBalances, baseCurrency, getRate]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return;
    const balanceNum = parseFloat(newAccountInitialBalance);
    const limitNum = parseFloat(newCreditLimit);
    const stmtDayNum = parseInt(newStatementDay, 10);
    const dueDayNum = parseInt(newDueDay, 10);

    const isCredit = newAccountGroup === 'credit' || newAccountGroup === 'credit_pay';

    await addAccount(
      newAccountName.trim(),
      'wallet',
      isNaN(balanceNum) ? 0 : balanceNum,
      selectedCurrency,
      newAccountGroup,
      {
        ...(isCredit ? {
          creditLimit: isNaN(limitNum) ? undefined : limitNum,
          statementDay: isNaN(stmtDayNum) ? undefined : stmtDayNum,
          dueDay: isNaN(dueDayNum) ? undefined : dueDayNum,
        } : {}),
        excludeFromStats: newAccountExcludeFromStats ? true : undefined,
      }
    );

    setNewAccountName('');
    setNewAccountInitialBalance('');
    setNewAccountCurrency('');
    setNewAccountGroup('cash');
    setNewCreditLimit('');
    setNewStatementDay('');
    setNewDueDay('');
    setNewAccountExcludeFromStats(false);
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

                {(newAccountGroup === 'credit' || newAccountGroup === 'credit_pay') && (
                  <div className="space-y-4 pt-1 border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.limit')}</label>
                      <Input 
                        className="font-mono"
                        type="number"
                        step="100"
                        placeholder={t('accounts.limitPlaceholder')}
                        value={newCreditLimit}
                        onChange={(e) => setNewCreditLimit(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.statementDay')}</label>
                        <Select value={newStatementDay || 'none'} onValueChange={(val) => setNewStatementDay(!val || val === 'none' ? '' : val)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('accounts.notSet')}>
                              {newStatementDay ? t('accounts.dayOfMonth', { day: newStatementDay }) : t('accounts.notSet')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            <SelectItem value="none">{t('accounts.notSet')}</SelectItem>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                              <SelectItem key={d} value={d.toString()}>{t('accounts.dayOfMonth', { day: d })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('accounts.dueDay')}</label>
                        <Select value={newDueDay || 'none'} onValueChange={(val) => setNewDueDay(!val || val === 'none' ? '' : val)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('accounts.notSet')}>
                              {newDueDay ? t('accounts.dayOfMonth', { day: newDueDay }) : t('accounts.notSet')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            <SelectItem value="none">{t('accounts.notSet')}</SelectItem>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                              <SelectItem key={d} value={d.toString()}>{t('accounts.dayOfMonth', { day: d })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <div className="space-y-0.5 pr-2">
                    <label className="text-xs font-medium text-foreground cursor-pointer block" onClick={() => setNewAccountExcludeFromStats(!newAccountExcludeFromStats)}>
                      {t('accounts.excludeFromStats')}
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {t('accounts.excludeFromStatsDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newAccountExcludeFromStats}
                    onClick={() => setNewAccountExcludeFromStats(!newAccountExcludeFromStats)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      newAccountExcludeFromStats ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ease-in-out",
                        newAccountExcludeFromStats ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
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
            <div className="w-full flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('accounts.netWorth')}</p>
              {hasForeignCurrency && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/20 select-none">
                  ≈ {t('accounts.rateEstimated')}
                </span>
              )}
            </div>
            <div className="text-5xl font-mono tracking-tighter font-medium text-foreground">
              <AmountDisplay 
                amount={netWorth} 
                baseCurrency={baseCurrency} 
                type="neutral" 
              />
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-5 border-r border-border flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.totalWallets')}</p>
              <p className={cn("text-2xl font-mono tracking-tight font-medium", totalWallets >= 0 ? "text-primary" : "text-destructive")}>
                <AmountDisplay 
                  amount={totalWallets} 
                  baseCurrency={baseCurrency} 
                  type={totalWallets >= 0 ? "income" : "expense"} 
                />
              </p>
            </div>
            <div className="p-5 flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('accounts.netLoans')}</p>
              <p className={cn("text-2xl font-mono tracking-tight font-medium", totalLoans >= 0 ? "text-primary" : "text-destructive")}>
                <AmountDisplay 
                  amount={totalLoans} 
                  baseCurrency={baseCurrency} 
                  type={totalLoans >= 0 ? "income" : "expense"} 
                />
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
            
            // 檢查該分組是否為單一幣種或混合幣種
            const groupCurrencies = new Set(groupAccounts.map(a => a.currency || baseCurrency));
            const isMultiCurrency = groupCurrencies.size > 1;
            const singleCurrency = !isMultiCurrency ? Array.from(groupCurrencies)[0] : baseCurrency;
            
            let groupTotal = 0;
            if (!isMultiCurrency) {
              groupTotal = groupAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
            } else {
              groupTotal = groupAccounts.reduce((sum, a) => {
                const raw = accountBalances[a.id] || 0;
                const curr = a.currency || baseCurrency;
                return sum + convertAmount(raw, curr, baseCurrency, getRate);
              }, 0);
            }
            
            const isGroupApproximate = isMultiCurrency || (singleCurrency !== baseCurrency);

            return (
              <div key={groupId} className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col">
                <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                  <span>{t(`accounts.${GROUP_I18N_KEYS[groupId]}` as any)}</span>
                  <AmountDisplay 
                    amount={groupTotal} 
                    baseCurrency={singleCurrency} 
                    isApproximate={isGroupApproximate}
                    type="neutral" 
                    className="opacity-50 font-normal"
                  />
                </div>
                <div className="divide-y divide-border">
                  {groupAccounts.map(account => {
                    const accCurr = account.currency || baseCurrency;
                    const isForeign = accCurr !== baseCurrency;
                    const rawBalance = accountBalances[account.id] || 0;
                    const convertedBalance = convertAmount(rawBalance, accCurr, baseCurrency, getRate);

                    const isCredit = account.group === 'credit' || account.group === 'credit_pay';
                    const hasLimit = typeof account.creditLimit === 'number' && account.creditLimit > 0;
                    const debt = Math.max(0, -rawBalance);
                    const usagePercent = hasLimit ? Math.min(100, Math.round((debt / account.creditLimit!) * 100)) : 0;

                    return (
                      <Link key={account.id} to={`/accounts/${account.id}`} className="flex flex-col p-4 transition-colors hover:bg-muted/10 group gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-none">{account.name}</span>
                              {account.isDefault && (
                                <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
                                  {t('accounts.default')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                              <span>{accCurr}</span>
                              {isCredit && hasLimit && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="text-[10px] text-muted-foreground/70">
                                    {t('accounts.limit')}：{getCurrencySymbol(accCurr)}{account.creditLimit!.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <AmountDisplay 
                              amount={rawBalance} 
                              baseCurrency={accCurr} 
                              type="neutral" 
                              className={cn("text-base leading-none", rawBalance < 0 ? 'text-destructive' : 'text-foreground')}
                            />
                            {isForeign && (
                              <span className="text-xs font-mono text-muted-foreground leading-none">
                                ≈ {getCurrencySymbol(baseCurrency)}{Math.abs(convertedBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </div>

                        {hasLimit && (
                          <div className="pt-1">
                            <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-300 rounded-full",
                                  usagePercent >= 85 ? "bg-destructive" : usagePercent >= 50 ? "bg-amber-500" : "bg-foreground/70"
                                )}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </Link>
                    );
                  })}
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
                {archivedWallets.map(account => {
                  const accCurr = account.currency || baseCurrency;
                  const isForeign = accCurr !== baseCurrency;
                  const rawBal = accountBalances[account.id] || 0;
                  const convertedBal = convertAmount(rawBal, accCurr, baseCurrency, getRate);

                  return (
                    <div key={account.id} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
                      <Link to={`/accounts/${account.id}`} className="flex flex-col gap-1 flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium leading-none text-muted-foreground hover:underline cursor-pointer">{account.name}</span>
                          <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
                            {t('accounts.archived', '已歸檔')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <span>{accCurr}</span>
                        </div>
                      </Link>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <AmountDisplay 
                            amount={rawBal} 
                            baseCurrency={accCurr} 
                            type="neutral" 
                            className="text-base text-muted-foreground leading-none"
                          />
                          {isForeign && (
                            <span className="text-xs font-mono text-muted-foreground/80 leading-none">
                              ≈ {getCurrencySymbol(baseCurrency)}{Math.abs(convertedBal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
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
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
