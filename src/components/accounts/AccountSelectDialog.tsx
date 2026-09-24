import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { convertAmount } from '@/lib/currency';
import type { Account } from '@/services/db/db';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { Check } from 'lucide-react';

export interface AccountSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: string;
  onSelectAccount: (account: Account) => void;
  disabledAccountIds?: string[];
  disabledReason?: string;
  title?: string;
  filterType?: 'wallet' | 'contact' | 'all';
}

const GROUP_ORDER = ['debit', 'cash', 'credit', 'credit_pay', 'investment', 'personal', 'organization', 'other'];
const GROUP_I18N_KEYS: Record<string, string> = {
  debit: 'accounts.groupDebit',
  cash: 'accounts.groupCash',
  credit: 'accounts.groupCredit',
  credit_pay: 'accounts.groupCreditPay',
  investment: 'accounts.groupInvestment',
  personal: 'contacts.groupPersonal',
  organization: 'contacts.groupOrganization',
  other: 'accounts.groupOther',
};

export function AccountSelectDialog({
  open,
  onOpenChange,
  selectedAccountId,
  onSelectAccount,
  disabledAccountIds = [],
  disabledReason,
  title,
  filterType = 'wallet',
}: AccountSelectDialogProps) {
  const { t } = useTranslation();
  const { wallets, contacts, accounts } = useAccounts();
  const { transactions } = useTransactions();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();

  const activeLedger = useMemo(() => ledgers?.find(l => l.id === activeLedgerId), [ledgers, activeLedgerId]);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  // Live account balance calculation across transactions
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!accounts || !transactions) return balances;

    accounts.forEach(a => {
      balances[a.id] = a.initialBalance || 0;
    });

    const contactIdSet = new Set(accounts.filter(a => a.type === 'contact').map(a => a.id));

    transactions.forEach(tx => {
      if (tx.deleted) return;
      if (tx.type === 'income') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
      } else if (tx.type === 'expense') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
        if (tx.reimbursementStatus === 'pending' && tx.reimbursementContactId && balances[tx.reimbursementContactId] !== undefined) {
          balances[tx.reimbursementContactId] += tx.amount;
        }
      } else if (tx.type === 'transfer' || tx.type === 'loan') {
        if (tx.type === 'loan' && tx.isGift) {
          // 贈與交易：只變動錢包餘額，不計入聯絡人應收應還
          if (!contactIdSet.has(tx.accountId) && balances[tx.accountId] !== undefined) {
            balances[tx.accountId] -= tx.amount;
          }
          if (tx.toAccountId && !contactIdSet.has(tx.toAccountId) && balances[tx.toAccountId] !== undefined) {
            balances[tx.toAccountId] += (tx.transferInAmount ?? tx.amount);
          }
        } else {
          if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
          if (tx.toAccountId && balances[tx.toAccountId] !== undefined) {
            balances[tx.toAccountId] += (tx.transferInAmount ?? tx.amount);
          }
        }
      }
    });

    return balances;
  }, [accounts, transactions]);

  // Determine eligible accounts based on filterType
  const eligibleAccounts = useMemo(() => {
    if (filterType === 'contact') {
      return contacts || [];
    }
    if (filterType === 'all') {
      return accounts || [];
    }
    return wallets || [];
  }, [filterType, contacts, accounts, wallets]);

  // Grouped active accounts
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    GROUP_ORDER.forEach(g => {
      groups[g] = [];
    });

    eligibleAccounts.forEach(acc => {
      let g = acc.group;
      if (!g || !GROUP_ORDER.includes(g)) {
        g = acc.type === 'contact' ? 'personal' : 'other';
      }
      if (!groups[g]) groups[g] = [];
      groups[g].push(acc);
    });

    return groups;
  }, [eligibleAccounts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[380px] max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden bg-card border border-border text-card-foreground shadow-none select-none"
      >
        {/* Header */}
        <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground tracking-tight">
              {title || t('accounts.selectAccountTitle', '選擇帳戶')}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Grouped Account Cards Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-3.5 no-scrollbar">
          {eligibleAccounts.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('accounts.accountNotFound', '找不到帳戶。')}
            </div>
          ) : (
            GROUP_ORDER.map(groupKey => {
              const items = groupedAccounts[groupKey] || [];
              if (items.length === 0) return null;

              const groupName = t(GROUP_I18N_KEYS[groupKey] || 'accounts.groupOther', groupKey);

              return (
                <div key={groupKey} className="border border-border rounded-xl overflow-hidden bg-card flex flex-col shadow-none">
                  {/* Group Header */}
                  <div className="px-3.5 py-2 bg-muted/30 border-b border-border text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupName}
                    </span>
                  </div>

                  {/* Accounts List: divide-y divide-border */}
                  <div className="divide-y divide-border">
                    {items.map(acc => {
                      const isSelected = selectedAccountId === acc.id;
                      const isDisabled = disabledAccountIds.includes(acc.id);
                      const rawBalance = accountBalances[acc.id] ?? acc.initialBalance ?? 0;
                      const accCurr = acc.currency || baseCurrency;
                      const isForeign = accCurr !== baseCurrency;
                      const convertedBalance = convertAmount(rawBalance, accCurr, baseCurrency, getRate);
                      const sym = getCurrencySymbol(accCurr);
                      const isCredit = acc.group === 'credit' || acc.group === 'credit_pay';
                      const hasLimit = typeof acc.creditLimit === 'number' && acc.creditLimit > 0;
                      const debt = Math.max(0, -rawBalance);
                      const usagePercent = hasLimit ? Math.min(100, Math.round((debt / acc.creditLimit!) * 100)) : 0;
                      const isContact = acc.type === 'contact';

                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            if (isDisabled) return;
                            onSelectAccount(acc);
                            onOpenChange(false);
                          }}
                          className={cn(
                            "p-3.5 flex flex-col gap-1.5 transition-colors select-none",
                            isDisabled
                              ? "opacity-40 cursor-not-allowed bg-muted/10"
                              : isSelected
                                ? "bg-muted/40 cursor-pointer"
                                : "hover:bg-muted/20 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            {/* Left: Avatar (for contacts), Name, Default Badge, Subtitle */}
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {isContact && (
                                <ContactAvatar
                                  group={acc.group}
                                  className="size-7"
                                  iconClassName="size-3.5 text-muted-foreground"
                                  title={acc.name}
                                />
                              )}
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {acc.name}
                                  </span>
                                  {acc.isDefault && (
                                    <span className="text-[9px] uppercase font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/60">
                                      {t('accounts.default', '預設')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mt-0.5">
                                  {isDisabled ? (
                                    <span className="text-[10px] text-muted-foreground font-medium truncate font-sans">
                                      {disabledReason || t('accounts.alreadySelectedSource', '當前轉出帳戶')}
                                    </span>
                                  ) : (
                                    <>
                                      <span>{accCurr}</span>
                                      {isCredit && hasLimit && (
                                        <>
                                          <span className="text-muted-foreground/40">·</span>
                                          <span className="text-[10px] text-muted-foreground/70 font-sans">
                                            {t('accounts.limit')}：{getCurrencySymbol(accCurr)}{acc.creditLimit!.toLocaleString()}
                                          </span>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Monospace Balance, Conversion, Checkmark */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                {isContact ? (
                                  rawBalance > 0 ? (
                                    <span className="font-mono text-sm font-semibold block leading-tight text-emerald-500 dark:text-emerald-400">
                                      <span className="text-xs font-sans font-medium mr-1">{t('contacts.toCollect')}</span>
                                      {sym}{Math.abs(rawBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : rawBalance < 0 ? (
                                    <span className="font-mono text-sm font-semibold block leading-tight text-rose-500 dark:text-rose-400">
                                      <span className="text-xs font-sans font-medium mr-1">{t('contacts.toPay')}</span>
                                      {sym}{Math.abs(rawBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-sm font-semibold block leading-tight text-muted-foreground">
                                      {sym}{Math.abs(rawBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  )
                                ) : (
                                  <span
                                    className={cn(
                                      "font-mono text-sm font-semibold block leading-tight",
                                      rawBalance < 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground"
                                    )}
                                  >
                                    {rawBalance < 0 ? '-' : ''}{sym}{Math.abs(rawBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                                {!isContact && isForeign && (
                                  <span className="text-[10px] font-mono text-muted-foreground block mt-0.5 leading-none">
                                    ≈ {getCurrencySymbol(baseCurrency)}{Math.abs(convertedBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-foreground shrink-0 ml-0.5" />
                              )}
                            </div>
                          </div>

                          {/* Progress Bar for Credit Card (Always shown for credit accounts) */}
                          {!isContact && isCredit && (
                            <div className="w-full bg-muted/60 h-1 rounded-full overflow-hidden mt-0.5">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  usagePercent >= 85 ? "bg-destructive" : usagePercent >= 50 ? "bg-amber-500" : "bg-foreground/70"
                                )}
                                style={{ width: `${usagePercent}%` }} 
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
