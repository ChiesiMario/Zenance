import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import type { Account } from '@/services/db/db';
import { cn, getCurrencySymbol } from '@/lib/utils';
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

  const getGroupDotColor = (group: string = 'cash') => {
    switch (group) {
      case 'debit':
        return 'bg-emerald-500';
      case 'cash':
        return 'bg-emerald-600';
      case 'credit':
        return 'bg-amber-500';
      case 'credit_pay':
        return 'bg-cyan-500';
      case 'investment':
        return 'bg-purple-500';
      case 'personal':
        return 'bg-purple-500';
      case 'organization':
        return 'bg-amber-500';
      default:
        return 'bg-zinc-500';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[360px] max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden bg-card border border-border text-card-foreground shadow-none select-none"
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
                <div key={groupKey} className="space-y-1.5">
                  {/* Group Header */}
                  <div className="px-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {groupName}
                    </span>
                  </div>

                  {/* Account Cards in Group */}
                  <div className="flex flex-col gap-1.5">
                    {items.map(acc => {
                      const isSelected = selectedAccountId === acc.id;
                      const isDisabled = disabledAccountIds.includes(acc.id);
                      const balance = accountBalances[acc.id] ?? acc.initialBalance ?? 0;
                      const currency = acc.currency || baseCurrency;
                      const sym = getCurrencySymbol(currency);
                      const isNegative = balance < 0;

                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            if (isDisabled) return;
                            onSelectAccount(acc);
                            onOpenChange(false);
                          }}
                          className={cn(
                            "group p-3 rounded-2xl border transition-all flex items-center justify-between shadow-none",
                            isDisabled
                              ? "opacity-40 cursor-not-allowed bg-muted/20 border-border/60"
                              : isSelected
                                ? "border-foreground bg-muted/60 dark:bg-muted/40 cursor-pointer"
                                : "border-border hover:border-foreground/30 hover:bg-muted/30 cursor-pointer bg-card"
                          )}
                        >
                          {/* Left: Indicator, Name, Badge / Disabled Reason */}
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", getGroupDotColor(acc.group))} />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-foreground truncate">
                                  {acc.name}
                                </span>
                                {acc.isDefault && (
                                  <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/50">
                                    {t('accounts.default', '預設')}
                                  </span>
                                )}
                              </div>
                              {isDisabled && (
                                <span className="text-[10px] text-muted-foreground font-medium truncate">
                                  {disabledReason || t('accounts.alreadySelectedSource', '當前轉出帳戶')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Monospace Balance, Currency, Checkmark */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span
                                className={cn(
                                  "font-mono text-sm font-semibold block leading-tight",
                                  isNegative ? "text-red-500 dark:text-red-400" : "text-foreground"
                                )}
                              >
                                {isNegative ? '-' : ''}{sym} {Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground block mt-0.5">
                                {currency}
                              </span>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-foreground shrink-0 ml-0.5" />
                            )}
                          </div>
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
