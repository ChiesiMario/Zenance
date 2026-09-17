import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isToday, isYesterday, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import type { Transaction } from '@/services/db/db';

export interface GroupedTransactionListProps {
  transactions: Transaction[];
  title?: React.ReactNode;
  contextAccountId?: string;
  contextContactId?: string;
  contextCategoryId?: string;
  showDailyBalance?: boolean;
  calcDailyBalance?: (dayTxs: Transaction[]) => number;
  renderItemLeft?: (tx: Transaction) => React.ReactNode;
  renderItemRight?: (tx: Transaction) => React.ReactNode;
  onTransactionClick?: (tx: Transaction) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export function GroupedTransactionList({
  transactions,
  title,
  contextAccountId,
  contextContactId,
  contextCategoryId,
  showDailyBalance = true,
  calcDailyBalance,
  renderItemLeft,
  renderItemRight,
  onTransactionClick,
  emptyState,
  className,
}: GroupedTransactionListProps) {
  const { t, i18n } = useTranslation();
  const { contacts } = useAccounts();
  const { allCategories } = useCategories();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();

  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const activeLedger = useMemo(() => {
    return ledgers?.find(l => l.id === activeLedgerId);
  }, [ledgers, activeLedgerId]);

  // Format date header matching Dashboard
  const formatDateHeader = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return t('common.today');
    if (isYesterday(date)) return t('common.yesterday');

    let str = format(date, 'MMM d, yyyy');
    if (i18n.language === 'zh-TW' || i18n.language === 'zh-CN') {
      str = format(date, 'yyyy年M月d日');
    }

    if (i18n.language.startsWith('zh')) {
      str = str.replace(/([0-9a-zA-Z])([一-龥])/g, '$1 $2').replace(/([一-龥])([0-9a-zA-Z])/g, '$1 $2');
    }

    return str;
  };

  const isBalanceAdjustment = (tx: Transaction) => {
    if (tx.type !== 'income' && tx.type !== 'expense') return false;
    const cat = allCategories?.find(c => c.id === tx.category);
    return !!cat?.isSystem;
  };

  const getCategoryName = (tx: Transaction) => {
    if (tx.type === 'transfer') return t('add.transfer');
    if (tx.type === 'loan') {
      const isLent = contacts?.some(c => c.id === tx.toAccountId);
      return isLent ? t('add.lent') : t('add.borrowed');
    }
    const cat = allCategories?.find(c => c.id === tx.category);
    if (cat?.isSystem) {
      return t('accounts.balanceAdjustment');
    }
    return cat?.name || tx.category;
  };

  // Group transactions by YYYY-MM-DD
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
      const date = tx.date.split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(tx);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(date => {
        let balance = 0;
        if (calcDailyBalance) {
          balance = calcDailyBalance(groups[date]);
        } else if (contextAccountId) {
          // Account context: Inflow - Outflow
          groups[date].forEach(tx => {
            if (tx.type === 'income' && tx.accountId === contextAccountId) balance += tx.amount;
            else if (tx.type === 'expense' && tx.accountId === contextAccountId) balance -= tx.amount;
            else if (tx.type === 'transfer' || tx.type === 'loan') {
              if (tx.accountId === contextAccountId) balance -= tx.amount;
              if (tx.toAccountId === contextAccountId) balance += (tx.transferInAmount ?? tx.amount);
            }
          });
        } else if (contextContactId) {
          // Contact context: Contact-specific flows
          groups[date].forEach(tx => {
            const isLent = tx.toAccountId === contextContactId;
            const isReimbExpense = tx.reimbursementContactId === contextContactId && tx.type === 'expense';
            const isReimbIncome = tx.reimbursementContactId === contextContactId && tx.type === 'income';
            if (isReimbIncome) balance += tx.amount;
            else if (isReimbExpense || isLent) balance -= tx.amount;
            else balance += tx.amount;
          });
        } else if (contextCategoryId) {
          // Category context
          groups[date].forEach(tx => {
            if (tx.type === 'income') balance += tx.amount;
            else if (tx.type === 'expense') balance -= tx.amount;
          });
        } else {
          // Default Dashboard context
          groups[date].forEach(t => {
            if (isBalanceAdjustment(t)) return;
            if (t.type === 'income') balance += t.amount;
            else if (t.type === 'expense') balance -= t.amount;
          });
        }

        return {
          date,
          transactions: groups[date],
          dailyBalance: balance,
        };
      });
  }, [transactions, calcDailyBalance, contextAccountId, contextContactId, contextCategoryId, allCategories]);

  const handleRowClick = (tx: Transaction) => {
    if (onTransactionClick) {
      onTransactionClick(tx);
    } else {
      setSelectedTransactionId(tx.id);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <div className="px-1">
          {title}
        </div>
      )}

      {transactions.length === 0 ? (
        emptyState || (
          <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">
            {t('dashboard.noActivity')}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          {groupedTransactions.map(group => (
            <div
              key={group.date}
              className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground flex flex-col"
            >
              {/* Sticky Glassmorphic Date Header */}
              <div className="sticky top-0 z-10 p-4 bg-background/80 backdrop-blur-md border-b border-border text-xs uppercase tracking-widest text-muted-foreground flex justify-between items-center">
                <span>{formatDateHeader(group.date)}</span>
                {showDailyBalance && group.dailyBalance !== 0 && (
                  <AmountDisplay
                    amount={group.dailyBalance}
                    baseCurrency={activeLedger?.baseCurrency}
                    type="neutral"
                    className="opacity-50 font-normal"
                  />
                )}
              </div>

              {/* Transactions List */}
              <div className="divide-y divide-border">
                {group.transactions.map(tx => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => handleRowClick(tx)}
                    className="w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                  >
                    {/* Item Left (Category, Badges, Note) */}
                    {renderItemLeft ? (
                      renderItemLeft(tx)
                    ) : (
                      <div className="flex flex-col gap-1 min-w-0 pr-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium leading-none">
                            {contextContactId && tx.reimbursementContactId === contextContactId && tx.type === 'income'
                              ? t('reimbursements.reimbursementRefund', '報銷回款')
                              : (contextCategoryId
                                  ? allCategories?.find(c => c.id === contextCategoryId)?.name || getCategoryName(tx)
                                  : getCategoryName(tx))}
                          </span>
                          
                          {/* Reimbursement Badges */}
                          {contextContactId && tx.reimbursementContactId === contextContactId && tx.type === 'income' ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              {t('contacts.refundIncome', '回款入帳')}
                            </span>
                          ) : (
                            <ReimbursementBadge transaction={tx} />
                          )}
                        </div>

                        {/* Note display */}
                        {(() => {
                          const isAdj = isBalanceAdjustment(tx);
                          const isDefaultNote =
                            tx.note === t('accounts.balanceAdjustmentNote') ||
                            tx.note === '手動餘額調整' ||
                            tx.note === '手动余额调整' ||
                            tx.note === 'Manual Balance Adjustment';
                          if (isAdj && isDefaultNote) return null;
                          if (!tx.note) return null;
                          return (
                            <div className="text-sm text-muted-foreground truncate">
                              {tx.note}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Item Right (Amount Display) */}
                    {renderItemRight ? (
                      renderItemRight(tx)
                    ) : (
                      <div className="flex items-center gap-3 shrink-0">
                        {contextAccountId ? (
                          <AmountDisplay
                            amount={
                              (tx.type === 'transfer' || tx.type === 'loan') && tx.accountId === contextAccountId
                                ? -tx.amount
                                : ((tx.type === 'transfer' || tx.type === 'loan') && tx.toAccountId === contextAccountId
                                    ? (tx.transferInAmount ?? tx.amount)
                                    : tx.amount)
                            }
                            originalCurrency={tx.originalCurrency}
                            baseCurrency={activeLedger?.baseCurrency}
                            type={
                              (tx.type === 'transfer' || tx.type === 'loan')
                                ? (tx.accountId === contextAccountId ? 'expense' : 'income')
                                : (tx.type as any)
                            }
                            showSign={true}
                            className={cn(
                              "text-base",
                              tx.type === 'expense'
                                ? 'text-muted-foreground'
                                : tx.type === 'income'
                                ? 'text-primary'
                                : (tx.type === 'transfer' || tx.type === 'loan')
                                ? (tx.accountId === contextAccountId ? 'text-muted-foreground' : 'text-primary')
                                : undefined
                            )}
                          />
                        ) : contextContactId ? (
                          (() => {
                            const isReimbExpense = tx.reimbursementContactId === contextContactId && tx.type === 'expense';
                            const isReimbIncome = tx.reimbursementContactId === contextContactId && tx.type === 'income';

                            if (isReimbExpense) {
                              return (
                                <AmountDisplay
                                  amount={tx.amount}
                                  originalCurrency={tx.originalCurrency}
                                  baseCurrency={activeLedger?.baseCurrency}
                                  type="neutral"
                                  className={cn(
                                    "text-base font-mono",
                                    tx.reimbursementStatus === 'pending'
                                      ? "text-amber-500 font-medium"
                                      : "text-muted-foreground"
                                  )}
                                  showSign={true}
                                />
                              );
                            }

                            if (isReimbIncome) {
                              return (
                                <AmountDisplay
                                  amount={tx.amount}
                                  originalCurrency={tx.originalCurrency}
                                  baseCurrency={activeLedger?.baseCurrency}
                                  type="income"
                                  className="text-base text-emerald-500 font-mono font-medium"
                                  showSign={true}
                                />
                              );
                            }

                            return (
                              <AmountDisplay
                                amount={((tx.type === 'transfer' || tx.type === 'loan') && tx.accountId === contextContactId) ? -tx.amount : tx.amount}
                                originalCurrency={tx.originalCurrency}
                                baseCurrency={activeLedger?.baseCurrency}
                                type={tx.type as any}
                                className={cn(
                                  "text-base font-mono",
                                  ((tx.type === 'transfer' || tx.type === 'loan') && tx.toAccountId === contextContactId)
                                    ? 'text-emerald-500'
                                    : (tx.type === 'expense' || ((tx.type === 'transfer' || tx.type === 'loan') && tx.accountId === contextContactId))
                                    ? 'text-muted-foreground'
                                    : undefined
                                )}
                                showSign={true}
                              />
                            );
                          })()
                        ) : (
                          <AmountDisplay
                            amount={
                              tx.type === 'loan' && contacts?.some(c => c.id === tx.toAccountId)
                                ? -tx.amount
                                : tx.amount
                            }
                            originalCurrency={tx.originalCurrency}
                            baseCurrency={activeLedger?.baseCurrency}
                            type={tx.type as any}
                            className={cn(
                              "text-base",
                              (tx.type === 'expense' ||
                                (tx.type === 'loan' && contacts?.some(c => c.id === tx.toAccountId))) &&
                                "text-muted-foreground"
                            )}
                          />
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction Details Dialog */}
      {!onTransactionClick && selectedTransactionId && (
        <TransactionDetailsDialog
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}
    </div>
  );
}
