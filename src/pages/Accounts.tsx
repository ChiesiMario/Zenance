import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Plus, Wallet, ChevronDown, Check, RefreshCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { cn, getCurrencySymbol, formatAmountNumber } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { MagnitudeBadge, EstimatedRateBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { calculateAccountBalances, convertAmount } from '@/lib/currency';
import { useBalanceSnapshots } from '@/hooks/useBalanceSnapshots';

export default function Accounts() {
  const { t } = useTranslation();
  const { wallets, archivedWallets, allContacts, unarchiveAccount } = useAccounts();
  const { transactions } = useTransactions();
  const { getRate } = useExchangeRates();
  const { latestSnapshotsMap } = useBalanceSnapshots();
  
  const [currentView, setCurrentView] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  // 匯總所有錢包實體（含已歸檔）與往來對象（含已歸檔），用於全面計算原生餘額
  const allAccountsAndContacts = useMemo(() => {
    const list: any[] = [];
    if (wallets) list.push(...wallets);
    if (archivedWallets) list.push(...archivedWallets);
    if (allContacts) list.push(...allContacts);
    return list;
  }, [wallets, archivedWallets, allContacts]);

  // 計算所有帳戶與往來對象在各自原生幣種下的餘額 (支援月度餘額快照加速)
  const accountBalances = useMemo(() => {
    if (!allAccountsAndContacts || allAccountsAndContacts.length === 0) return {};
    return calculateAccountBalances(allAccountsAndContacts, transactions || [], getRate, baseCurrency, latestSnapshotsMap);
  }, [allAccountsAndContacts, transactions, getRate, baseCurrency, latestSnapshotsMap]);

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
    return (allContacts || []).some(
      c => (c.currency || baseCurrency) !== baseCurrency && (accountBalances[c.id] || 0) !== 0
    );
  }, [allContacts, baseCurrency, accountBalances]);

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

    allContacts?.forEach(c => {
      const raw = accountBalances[c.id] || 0;
      const curr = c.currency || baseCurrency;
      loansSum += convertAmount(raw, curr, baseCurrency, getRate);
    });

    return {
      totalWallets: Math.round(walletsSum * 100) / 100,
      totalLoans: Math.round(loansSum * 100) / 100,
      netWorth: Math.round((walletsSum + loansSum) * 100) / 100,
    };
  }, [wallets, allContacts, accountBalances, baseCurrency, getRate]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
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
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
            <AccountFormDialog 
              open={isDialogOpen} 
              onOpenChange={setIsDialogOpen} 
              mode="create" 
            />
          </>
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      <div className="space-y-4">
        {currentView === 'active' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
          <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center">
            <div className="relative flex items-center justify-center h-5 mb-2 w-full">
              {hasForeignCurrency && (
                <EstimatedRateBadge className="absolute left-0" />
              )}
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('accounts.netWorth')}</p>
              <div className="absolute right-0 flex items-center">
                <MagnitudeBadge amount={netWorth} memoryKey="accounts-net-worth" />
              </div>
            </div>
            <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-2 leading-none">
              <AmountDisplay 
                amount={netWorth} 
                baseCurrency={baseCurrency} 
                type="balance" 
                animated
                memoryKey="accounts-net-worth"
              />
            </AutoMarquee>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-5 border-r border-border flex flex-col">
              <div className="flex items-center justify-between h-5 mb-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('accounts.totalWallets')}</p>
                <MagnitudeBadge amount={totalWallets} memoryKey="accounts-total-wallets" />
              </div>
              <div className={cn("text-2xl font-mono tracking-tight font-medium leading-none", totalWallets >= 0 ? "text-primary" : "text-destructive")}>
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalWallets} 
                    baseCurrency={baseCurrency} 
                    type={totalWallets >= 0 ? "income" : "expense"} 
                    animated
                    memoryKey="accounts-total-wallets"
                  />
                </AutoMarquee>
              </div>
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex items-center justify-between h-5 mb-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('accounts.netLoans')}</p>
                <MagnitudeBadge amount={totalLoans} memoryKey="accounts-net-loans" />
              </div>
              <div className={cn("text-2xl font-mono tracking-tight font-medium leading-none", totalLoans >= 0 ? "text-primary" : "text-destructive")}>
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalLoans} 
                    baseCurrency={baseCurrency} 
                    type={totalLoans >= 0 ? "income" : "expense"} 
                    animated
                    memoryKey="accounts-net-loans"
                  />
                </AutoMarquee>
              </div>
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
              <div key={groupId} className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground flex flex-col">
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
                                ≈ {getCurrencySymbol(baseCurrency)}{formatAmountNumber(Math.abs(convertedBalance))}
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
                              ≈ {getCurrencySymbol(baseCurrency)}{formatAmountNumber(Math.abs(convertedBal))}
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
    </div>
  );
}
