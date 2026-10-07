import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { convertAmount } from '@/lib/currency';
import type { Wallet, Contact } from '@/services/db/db';
import { cn, getCurrencySymbol, formatAmountNumber } from '@/lib/utils';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';

export type SelectableAccount = (Wallet | Contact) & {
  type?: 'wallet' | 'contact';
  initialBalance?: number;
  creditLimit?: number;
};

export interface AccountSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: string;
  onSelectAccount: (account: any) => void;
  disabledAccountIds?: string[];
  disabledReason?: string;
  title?: string;
  filterType?: 'wallet' | 'contact' | 'all';
  className?: string;
  overlayClassName?: string;
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
  className,
  overlayClassName,
}: AccountSelectDialogProps) {
  const { t } = useTranslation();
  const { wallets, contacts } = useAccounts();
  const { transactions } = useTransactions();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();

  const activeLedger = useMemo(() => ledgers?.find(l => l.id === activeLedgerId), [ledgers, activeLedgerId]);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  // Live account balance calculation across transactions
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!transactions) return balances;

    (wallets || []).forEach(w => {
      balances[w.id] = w.initialBalance || 0;
    });
    (contacts || []).forEach(c => {
      balances[c.id] = 0;
    });

    const contactIdSet = new Set((contacts || []).map(c => c.id));

    transactions.forEach(tx => {
      if (tx.deleted) return;
      if (tx.type === 'income') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
      } else if (tx.type === 'expense') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount;
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
  }, [wallets, contacts, transactions]);

  // Determine eligible accounts based on filterType
  const eligibleAccounts = useMemo(() => {
    if (filterType === 'contact') {
      return (contacts || []).map(c => ({ ...c, type: 'contact' as const }));
    }
    if (filterType === 'all') {
      return [
        ...(wallets || []).map(w => ({ ...w, type: 'wallet' as const })),
        ...(contacts || []).map(c => ({ ...c, type: 'contact' as const })),
      ];
    }
    return (wallets || []).map(w => ({ ...w, type: 'wallet' as const }));
  }, [filterType, contacts, wallets]);

  // Grouped active accounts
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, SelectableAccount[]> = {};
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
        overlayClassName={cn("z-[70]", overlayClassName)}
        className={cn("z-[70] w-full max-w-[350px] sm:max-w-[350px] max-h-[85vh] max-h-[85dvh] p-0 sm:p-0 flex flex-col gap-0 overflow-hidden bg-card border border-border text-card-foreground shadow-none select-none rounded-2xl", className)}
      >
        {/* Header */}
        <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-border pr-12">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold tracking-tight text-foreground uppercase">
              {title || t('accounts.selectAccountTitle', '選擇帳戶')}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Grouped Account Cards Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 no-scrollbar">
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
                  <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[11px]">
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
                            "px-3 py-2.5 flex flex-col gap-1 transition-colors select-none",
                            isDisabled
                              ? "opacity-40 cursor-not-allowed bg-muted/10"
                              : isSelected
                                ? "bg-foreground text-background cursor-pointer"
                                : "hover:bg-muted/20 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            {/* Left: Avatar (for contacts), Name, Default Badge, Subtitle */}
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {isContact && (
                                <ContactAvatar
                                  group={acc.group}
                                  className={cn("size-7", isSelected && "ring-1 ring-background/30")}
                                  iconClassName={cn("size-3.5", isSelected ? "text-background" : "text-muted-foreground")}
                                  title={acc.name}
                                />
                              )}
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    "text-sm font-medium truncate",
                                    isSelected ? "text-background font-semibold" : "text-foreground"
                                  )}>
                                    {acc.name}
                                  </span>
                                  {'isDefault' in acc && acc.isDefault && (
                                    <span className={cn(
                                      "text-[9px] uppercase font-medium px-1.5 py-0.2 rounded border",
                                      isSelected
                                        ? "bg-background/20 text-background border-background/30"
                                        : "bg-muted text-muted-foreground border-border/60"
                                    )}>
                                      {t('accounts.default', '預設')}
                                    </span>
                                  )}
                                </div>
                                <div className={cn(
                                  "flex items-center gap-1.5 text-xs font-mono mt-0.5",
                                  isSelected ? "text-background/75" : "text-muted-foreground"
                                )}>
                                  {isDisabled ? (
                                    <span className="text-[10px] text-muted-foreground font-medium truncate font-sans">
                                      {disabledReason || t('accounts.alreadySelectedSource', '當前轉出帳戶')}
                                    </span>
                                  ) : (
                                    <>
                                      <span>{accCurr}</span>
                                      {isCredit && hasLimit && (
                                        <>
                                          <span className={isSelected ? "text-background/40" : "text-muted-foreground/40"}>·</span>
                                          <span className={cn(
                                            "text-[10px] font-sans",
                                            isSelected ? "text-background/80" : "text-muted-foreground/70"
                                          )}>
                                            {t('accounts.limit')}：{getCurrencySymbol(accCurr)}{acc.creditLimit!.toLocaleString()}
                                          </span>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Monospace Balance, Conversion */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                {isContact ? (
                                  rawBalance > 0 ? (
                                    <span className={cn(
                                      "font-mono text-sm font-semibold block leading-tight",
                                      isSelected ? "text-emerald-300" : "text-emerald-500"
                                    )}>
                                      <span className="text-xs font-sans font-medium mr-1">{t('contacts.toCollect')}</span>
                                      {sym}{formatAmountNumber(Math.abs(rawBalance))}
                                    </span>
                                  ) : rawBalance < 0 ? (
                                    <span className={cn(
                                      "font-mono text-sm font-semibold block leading-tight",
                                      isSelected ? "text-rose-300" : "text-rose-500"
                                    )}>
                                      <span className="text-xs font-sans font-medium mr-1">{t('contacts.toPay')}</span>
                                      {sym}{formatAmountNumber(Math.abs(rawBalance))}
                                    </span>
                                  ) : (
                                    <span className={cn(
                                      "font-mono text-sm font-semibold block leading-tight",
                                      isSelected ? "text-background/70" : "text-muted-foreground"
                                    )}>
                                      {sym}{formatAmountNumber(Math.abs(rawBalance))}
                                    </span>
                                  )
                                ) : (
                                  <span
                                    className={cn(
                                      "font-mono text-sm font-semibold block leading-tight",
                                      rawBalance < 0
                                        ? isSelected ? "text-rose-300" : "text-rose-500"
                                        : isSelected ? "text-background font-bold" : "text-foreground"
                                    )}
                                  >
                                    {rawBalance < 0 ? '-' : ''}{sym}{formatAmountNumber(Math.abs(rawBalance))}
                                  </span>
                                )}
                                {!isContact && isForeign && (
                                  <span className={cn(
                                    "text-[10px] font-mono block mt-0.5 leading-none",
                                    isSelected ? "text-background/60" : "text-muted-foreground"
                                  )}>
                                    ≈ {getCurrencySymbol(baseCurrency)}{formatAmountNumber(Math.abs(convertedBalance))}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Progress Bar for Credit Card (Always shown for credit accounts) */}
                          {!isContact && isCredit && (
                            <div className={cn(
                              "w-full h-1 rounded-full overflow-hidden mt-0.5",
                              isSelected ? "bg-background/25" : "bg-muted/60"
                            )}>
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  usagePercent >= 85
                                    ? isSelected ? "bg-rose-400" : "bg-destructive"
                                    : usagePercent >= 50
                                      ? isSelected ? "bg-amber-400" : "bg-amber-500"
                                      : isSelected ? "bg-background" : "bg-foreground/70"
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
