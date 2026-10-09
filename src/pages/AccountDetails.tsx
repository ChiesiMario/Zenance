import { useParams, useNavigate } from 'react-router-dom';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog';
import { AdjustBalanceDialog } from '@/components/accounts/AdjustBalanceDialog';
import { ChevronLeft, Edit, Scale, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { cn, getCurrencySymbol, sortTransactionsDesc, formatAmountNumber } from '@/lib/utils';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { MagnitudeBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { getTxAccountDelta, convertAmount } from '@/lib/currency';

export default function AccountDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getRate } = useExchangeRates();
  
  const { allAccounts } = useAccounts();
  const { transactions } = useTransactions();
  const { activeLedgerId, openAddModal } = useAppStore();
  const { ledgers } = useLedgers();
  
  const account = allAccounts?.find(a => a.id === id);
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currency = account?.currency || baseCurrency;
  const currencySymbol = getCurrencySymbol(currency);
  const isForeign = currency !== baseCurrency;
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAdjustBalanceDialogOpen, setIsAdjustBalanceDialogOpen] = useState(false);

  const accountTransactions = useMemo(() => {
    const list = transactions?.filter(tx => tx.accountId === id || tx.toAccountId === id) || [];
    return sortTransactionsDesc(list);
  }, [transactions, id]);

  const hasTransactions = accountTransactions.length > 0;

  const isLoading = transactions === undefined || allAccounts === undefined;

  const { balance, totalIncome, totalExpense } = useMemo(() => {
    if (isLoading || !account) {
      return { balance: undefined, totalIncome: undefined, totalExpense: undefined };
    }

    let bal = account.initialBalance || 0;
    let income = 0;
    let expense = 0;
    
    accountTransactions.forEach(tx => {
      const delta = getTxAccountDelta(tx, account, getRate, baseCurrency);
      bal += delta;
      if (delta > 0) {
        income += delta;
      } else if (delta < 0) {
        expense += Math.abs(delta);
      }
    });

    return {
      balance: Math.round(bal * 100) / 100,
      totalIncome: Math.round(income * 100) / 100,
      totalExpense: Math.round(expense * 100) / 100,
    };
  }, [accountTransactions, account, getRate, baseCurrency, isLoading]);

  const isCreditAccount = account?.group === 'credit' || account?.group === 'credit_pay';
  const hasCreditLimit = typeof account?.creditLimit === 'number' && account.creditLimit > 0;
  const currentDebt = balance !== undefined ? Math.max(0, -balance) : 0;
  const availableCredit = hasCreditLimit && balance !== undefined ? Math.max(0, account!.creditLimit! - currentDebt) : 0;
  const usagePercent = hasCreditLimit && balance !== undefined ? Math.min(100, Math.round((currentDebt / account!.creditLimit!) * 100)) : 0;

  if (allAccounts !== undefined && !account) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <p>{t('accounts.accountNotFound', 'Account not found.')}</p>
        <Button variant="outline" onClick={() => navigate('/accounts')}>{t('common.back')}</Button>
      </div>
    );
  }



  return (
    <div className="w-full space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate('/accounts')} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 px-2 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight truncate">{account?.name}</h2>
          {account?.archived && (
            <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm font-normal shrink-0">
              {t('accounts.archived', '已歸檔')}
            </span>
          )}
        </div>
        <div className="w-8"></div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-8 border-b border-border flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center h-5 mb-2 w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('accounts.balance')}</p>
            <div className="absolute right-0 flex items-center">
              <MagnitudeBadge amount={balance} memoryKey={`account-balance-${id}`} />
            </div>
          </div>
          <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-4 leading-none">
            <AmountDisplay 
              amount={balance} 
              baseCurrency={currency} 
              type="balance" 
              memoryKey={`account-balance-${id}`}
              className="leading-none"
            />
          </AutoMarquee>
          {account?.excludeFromStats && (
            <div className="mt-2 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/20 select-none">
              {t('accounts.excludedFromStatsTag')}
            </div>
          )}
          {isForeign && balance !== undefined && (
            <div className="flex items-center gap-1.5 mt-2 text-xs font-mono text-muted-foreground select-text">
              <span>≈ {getCurrencySymbol(baseCurrency)}{formatAmountNumber(Math.abs(convertAmount(balance, currency, baseCurrency, getRate)))}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-muted/20 select-none">
                {t('accounts.rateEstimated')}
              </span>
            </div>
          )}
        </div>

        {isCreditAccount ? (
          <>
            <div className="grid grid-cols-2 gap-px bg-border">
              <div className="bg-card p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between h-5 mb-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground leading-none">{t('accounts.availableCredit')}</p>
                    {hasCreditLimit && <MagnitudeBadge amount={availableCredit} memoryKey={`account-credit-${id}`} />}
                  </div>
                  <p className="text-xl sm:text-2xl font-mono tracking-tight font-medium text-foreground select-text leading-none mt-1">
                    {hasCreditLimit ? `${currencySymbol}${formatAmountNumber(availableCredit)}` : '-'}
                  </p>
                </div>
                <div className="mt-2 text-xs font-mono text-muted-foreground">
                  <span>{t('accounts.creditLimit')}: </span>
                  <span className="text-foreground/80 font-medium">
                    {hasCreditLimit ? `${currencySymbol}${formatAmountNumber(account!.creditLimit!)}` : t('accounts.notSet')}
                  </span>
                </div>
              </div>

              <div className="bg-card p-4 flex flex-col justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border mb-2">
                    {t('accounts.billingCycle')}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-foreground">{t('accounts.statementDay')}</span>
                      <span className="text-foreground font-medium">
                        {account?.statementDay ? t('accounts.dayOfMonth', { day: account.statementDay }) : t('accounts.notSet')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-foreground">{t('accounts.dueDay')}</span>
                      <span className="text-foreground font-medium">
                        {account?.dueDay ? t('accounts.dayOfMonth', { day: account.dueDay }) : t('accounts.notSet')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {hasCreditLimit && (
              <div className="px-5 py-3 border-t border-border bg-muted/10 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">{t('accounts.limitUsage')}</span>
                  <span className="text-foreground font-medium">{usagePercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-300 rounded-full",
                      usagePercent >= 85 ? "bg-destructive" : usagePercent >= 50 ? "bg-amber-500" : "bg-foreground/80"
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-border">
            <div className="bg-card p-4">
              <div className="flex items-center justify-between h-5 mb-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('dashboard.income')}</p>
                <MagnitudeBadge amount={totalIncome} memoryKey={`account-income-${id}`} />
              </div>
              <div className="text-2xl font-mono tracking-tight font-medium leading-none">
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalIncome} 
                    baseCurrency={currency} 
                    type="income" 
                    memoryKey={`account-income-${id}`}
                  />
                </AutoMarquee>
              </div>
            </div>
            <div className="bg-card p-4">
              <div className="flex items-center justify-between h-5 mb-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('dashboard.expense')}</p>
                <MagnitudeBadge amount={totalExpense} memoryKey={`account-expense-${id}`} />
              </div>
              <div className="text-2xl font-mono tracking-tight font-medium leading-none">
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalExpense} 
                    baseCurrency={currency} 
                    type="expense" 
                    showSign={false} 
                    memoryKey={`account-expense-${id}`}
                  />
                </AutoMarquee>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex border border-border rounded-lg overflow-hidden bg-card text-card-foreground divide-x divide-border">
        <button 
          onClick={() => setIsEditDialogOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <Edit className="h-4 w-4 text-muted-foreground" />
          <span>{t('accounts.editAccount', 'Edit Account')}</span>
        </button>
        {isCreditAccount && (
          <button 
            onClick={() => openAddModal('transfer', undefined, undefined, id, currentDebt > 0 ? currentDebt : undefined)}
            className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer text-primary"
          >
            <CreditCard className="h-4 w-4 text-primary" />
            <span>{t('accounts.repay')}</span>
          </button>
        )}
        <button 
          onClick={() => setIsAdjustBalanceDialogOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
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

      <AccountFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        mode="edit"
        account={account}
        hasTransactions={hasTransactions}
        onDeleted={() => navigate('/accounts')}
        onArchived={() => navigate('/accounts')}
      />
      
      {/* 調整餘額彈窗 (平級兄弟節點聲明) */}
      <AdjustBalanceDialog
        open={isAdjustBalanceDialogOpen}
        onOpenChange={setIsAdjustBalanceDialogOpen}
        accountId={id!}
        currentBalance={balance ?? 0}
        currency={currency}
      />
    </div>
  );
}
