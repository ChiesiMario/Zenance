import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, sortTransactionsDesc, formatTransactionDateHeader } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { ChevronRight, User, Building2 } from 'lucide-react';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import type { Transaction } from '@/services/db/db';

interface ContactCapsuleProps {
  name: string;
  group?: string;
  maxWidthClass?: string;
}

function ContactCapsule({ name, group, maxWidthClass = 'max-w-[120px]' }: ContactCapsuleProps) {
  const isOrg = group === 'organization';
  const Icon = isOrg ? Building2 : User;
  return (
    <span
      title={name}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 leading-none shrink-0",
        maxWidthClass
      )}
    >
      <Icon className="w-3 h-3 text-muted-foreground/70 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export interface SingleTransactionItem {
  isSplitGroup: false;
  tx: Transaction;
}

export interface SplitGroupItem {
  isSplitGroup: true;
  id: string;
  date: string;
  category: string;
  categoryName: string;
  transactions: Transaction[];
  totalAmount: number;
  contactNames: string[];
  contactsList: { id: string; name: string; group?: string }[];
  hasSelf: boolean;
  isTransferGroup?: boolean;
  transferTx?: Transaction;
  feeAmount?: number;
  note?: string;
  latestCreatedAt: string;
}

export type DisplayListItem = 
  | SingleTransactionItem
  | SplitGroupItem;

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
  const { contacts, archivedContacts, wallets, accounts, archivedAccounts } = useAccounts();
  const { allCategories } = useCategories();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();

  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [expandedSplitIds, setExpandedSplitIds] = useState<Set<string>>(new Set());

  const toggleExpandSplit = (id: string) => {
    setExpandedSplitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeLedger = useMemo(() => {
    return ledgers?.find(l => l.id === activeLedgerId);
  }, [ledgers, activeLedgerId]);

  // Format date header matching Dashboard
  const formatDateHeader = (dateStr: string) => {
    return formatTransactionDateHeader(dateStr, t, i18n.language);
  };

  const getAccountName = useCallback((id?: string) => {
    if (!id) return t('common.unknownAccount');
    const target = wallets?.find(w => w.id === id) 
      || accounts?.find(a => a.id === id) 
      || archivedAccounts?.find(a => a.id === id);
    return target?.name || t('common.unknownAccount');
  }, [wallets, accounts, archivedAccounts, t]);

  const accountCurrencies = useMemo(() => {
    const map = new Map<string, string>();
    wallets?.forEach((w) => {
      if (w.currency) map.set(w.id, w.currency);
    });
    accounts?.forEach((a) => {
      if (a.currency) map.set(a.id, a.currency);
    });
    contacts?.forEach((c) => {
      if (c.currency) map.set(c.id, c.currency);
    });
    archivedAccounts?.forEach((a) => {
      if (a.currency) map.set(a.id, a.currency);
    });
    archivedContacts?.forEach((c) => {
      if (c.currency) map.set(c.id, c.currency);
    });
    return map;
  }, [wallets, accounts, contacts, archivedAccounts, archivedContacts]);

  const getDisplayAmountInfo = useCallback(
    (tx: Transaction, baseCurr: string) => {
      const fromCurr = tx.accountId
        ? accountCurrencies.get(tx.accountId) || tx.originalCurrency || baseCurr
        : tx.originalCurrency || baseCurr;
      const toCurr = tx.toAccountId ? accountCurrencies.get(tx.toAccountId) : undefined;

      const isForeignTo = Boolean(toCurr && toCurr !== baseCurr);
      const isForeignFrom = Boolean(fromCurr && fromCurr !== baseCurr);
      const isForeignOriginal = Boolean(tx.originalCurrency && tx.originalCurrency !== baseCurr);

      const isTransfer = tx.type === 'transfer';
      const isLoan = tx.type === 'loan';
      const isLend =
        isLoan &&
        (contacts?.some((c) => c.id === tx.toAccountId) ||
          archivedContacts?.some((c) => c.id === tx.toAccountId));
      const isBorrow = isLoan && !isLend;
      const isIncome = tx.type === 'income';
      const isExpense = tx.type === 'expense';

      // 1. 轉帳 (Transfer)
      if (isTransfer) {
        // 收款方為外幣卡：優先展示外幣卡的實際到款金額 (例如 $1)
        if (isForeignTo && toCurr) {
          const amount =
            tx.transferInAmount !== undefined && tx.transferInAmount > 0
              ? tx.transferInAmount
              : tx.originalAmount ?? tx.amount;
          return {
            amount,
            currency: toCurr,
            type: 'transfer' as const,
            isApproximate: false,
            showSign: false,
          };
        }
        // 出款方為外幣卡：展示外幣出款金額 (例如 $1)
        if ((isForeignFrom || isForeignOriginal) && fromCurr) {
          return {
            amount: tx.originalAmount ?? tx.amount,
            currency: tx.originalCurrency || fromCurr,
            type: 'transfer' as const,
            isApproximate: false,
            showSign: false,
          };
        }
        // 本幣轉帳
        return {
          amount: tx.originalAmount ?? tx.amount,
          currency: tx.originalCurrency || baseCurr,
          type: 'transfer' as const,
          isApproximate: false,
          showSign: false,
        };
      }

      // 2. 借貸之收款 / 借入 (Borrow / Loan Collection)
      if (isBorrow) {
        // 收款錢包為外幣卡：展示外幣卡的實際到款金額 (例如 $1)
        if (isForeignTo && toCurr) {
          const amount =
            tx.transferInAmount !== undefined && tx.transferInAmount > 0
              ? tx.transferInAmount
              : tx.originalAmount ?? tx.amount;
          return {
            amount,
            currency: toCurr,
            type: 'income' as const,
            isApproximate: false,
            showSign: false,
          };
        }
        // 原幣為外幣或出款為外幣
        if (isForeignOriginal || isForeignFrom) {
          return {
            amount: tx.originalAmount ?? tx.amount,
            currency: tx.originalCurrency || fromCurr || baseCurr,
            type: 'income' as const,
            isApproximate: false,
            showSign: false,
          };
        }
        return {
          amount: tx.originalAmount ?? tx.amount,
          currency: tx.originalCurrency || baseCurr,
          type: 'income' as const,
          isApproximate: false,
          showSign: false,
        };
      }

      // 3. 借貸之出借 (Lend)
      if (isLend) {
        const loanAmt = tx.originalAmount ?? tx.amount;
        const curr = tx.originalCurrency || fromCurr || baseCurr;
        return {
          amount: -loanAmt,
          currency: curr,
          type: 'expense' as const,
          isApproximate: false,
          showSign: true,
        };
      }

      // 4. 一般收入 / 收款 (Income)
      if (isIncome) {
        const accCurr = tx.accountId ? accountCurrencies.get(tx.accountId) : undefined;
        const targetCurr = tx.originalCurrency || accCurr || baseCurr;
        if (targetCurr !== baseCurr) {
          return {
            amount: tx.originalAmount ?? tx.amount,
            currency: targetCurr,
            type: 'income' as const,
            isApproximate: false,
            showSign: false,
          };
        }
        return {
          amount: tx.amount,
          currency: baseCurr,
          type: 'income' as const,
          isApproximate: false,
          showSign: false,
        };
      }

      // 5. 一般支出 (Expense)
      if (isExpense) {
        const accCurr = tx.accountId ? accountCurrencies.get(tx.accountId) : undefined;
        const targetCurr = tx.originalCurrency || accCurr || baseCurr;
        if (targetCurr !== baseCurr) {
          return {
            amount: -(tx.originalAmount ?? tx.amount),
            currency: targetCurr,
            type: 'expense' as const,
            isApproximate: false,
            showSign: true,
          };
        }
        return {
          amount: -tx.amount,
          currency: baseCurr,
          type: 'expense' as const,
          isApproximate: false,
          showSign: true,
        };
      }

      return {
        amount: tx.amount,
        currency: tx.originalCurrency || baseCurr,
        type: (tx.type as any) || 'neutral',
        isApproximate: Boolean(tx.originalCurrency && tx.originalCurrency !== baseCurr),
        showSign: false,
      };
    },
    [accountCurrencies, contacts, archivedContacts]
  );

  const isBalanceAdjustment = useCallback((tx: Transaction) => {
    if (tx.type !== 'income' && tx.type !== 'expense') return false;
    const cat = allCategories?.find(c => c.id === tx.category);
    return !!cat?.isSystem;
  }, [allCategories]);

  const getCategoryName = useCallback((tx: Transaction) => {
    if (tx.isGift) {
      return t('add.gift', '贈與');
    }
    if (tx.type === 'transfer') return t('add.transfer');
    if (tx.type === 'loan') {
      if (tx.category === 'advance') {
        return t('add.reimburse', '代付');
      }
      const isLent = contacts?.some(c => c.id === tx.toAccountId);
      return isLent ? t('add.lent') : t('add.borrowed');
    }
    const cat = allCategories?.find(c => c.id === tx.category);
    if (cat?.isSystem) {
      return t('accounts.balanceAdjustment');
    }
    if (cat?.name && (cat.name.includes('差額吸收') || cat.name.includes('差额吸收') || cat.name === '抹零' || cat.name.toLowerCase().includes('write-off'))) {
      return t('reimbursements.writeOffCategory', '抹零');
    }
    return cat?.name || tx.category;
  }, [t, contacts, allCategories]);

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
              if (tx.type === 'loan' && tx.isGift) {
                const isContact = contacts?.some(c => c.id === contextAccountId);
                if (isContact) return;
              }
              if (tx.accountId === contextAccountId) balance -= tx.amount;
              if (tx.toAccountId === contextAccountId) balance += (tx.transferInAmount ?? tx.amount);
            }
          });
        } else if (contextContactId) {
          // Contact context: Contact-specific flows
          groups[date].forEach(tx => {
            if (tx.isGift) return; // 贈與交易不計入聯絡人借貸變動
            if (tx.type === 'transfer' || tx.type === 'loan') {
              if (tx.toAccountId === contextContactId) balance += (tx.transferInAmount ?? tx.amount);
              if (tx.accountId === contextContactId) balance -= tx.amount;
            }
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

        // 聚合同一分攤群組 (多人分攤 / 轉帳手續費)
        const splitMap = new Map<string, Transaction[]>();
        const normalTxs: Transaction[] = [];

        groups[date].forEach(tx => {
          if (tx.splitGroupId) {
            const list = splitMap.get(tx.splitGroupId) || [];
            list.push(tx);
            splitMap.set(tx.splitGroupId, list);
            return;
          }

          normalTxs.push(tx);
        });

        const displayItems: DisplayListItem[] = [];

        // 加入普通交易
        normalTxs.forEach(tx => {
          displayItems.push({ isSplitGroup: false, tx });
        });

        // 加入組合群組項目 (多人分攤 / 轉帳手續費)
        splitMap.forEach((batchTxs, groupId) => {
          if (batchTxs.length === 0) return;
          const sortedBatch = sortTransactionsDesc(batchTxs);
          const totalAmount = Math.round(batchTxs.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;

          const transferTx = batchTxs.find((t) => t.type === 'transfer');
          const isTransferGroup = !!transferTx;
          const feeTx = isTransferGroup ? batchTxs.find((t) => t.type === 'expense') : undefined;
          const feeAmount = feeTx ? feeTx.amount : 0;

          const hasSelf = !isTransferGroup && batchTxs.some((t) => t.type === 'expense');
          const contactIds = Array.from(
            new Set(
              batchTxs
                .filter((t) => t.toAccountId && t.type !== 'transfer')
                .map((t) => t.toAccountId!)
            )
          );
          const contactsList = contactIds.map((cId) => {
            const c =
              contacts?.find((item) => item.id === cId) ||
              archivedContacts?.find((item) => item.id === cId) ||
              accounts?.find((item) => item.id === cId);
            return { id: cId, name: c?.name || cId, group: c?.group };
          });
          const contactNames = contactsList.map((c) => c.name);
          const selfTx = batchTxs.find((t) => t.type === 'expense');
          const mainTx = transferTx || selfTx || batchTxs[0];
          const catName = getCategoryName(mainTx);
          const rawNote = isTransferGroup
            ? (transferTx?.note || '')
            : (batchTxs.find((t) => t.note && !t.note.includes('手續費') && !t.note.includes('手续费'))?.note || '');
          const cleanNote = rawNote.trim();
          const isFeePlaceholder =
            cleanNote === '手續費' ||
            cleanNote === '手续费' ||
            cleanNote === 'Fee' ||
            cleanNote.startsWith('(手續費)') ||
            cleanNote.startsWith('(手续费)');
          const note = !isFeePlaceholder && cleanNote ? cleanNote : undefined;
          const latestCreatedAt = sortedBatch[0]?.createdAt || sortedBatch[0]?.date;

          displayItems.push({
            isSplitGroup: true,
            id: groupId,
            date,
            category: mainTx.category,
            categoryName: catName,
            transactions: sortedBatch,
            totalAmount,
            contactNames,
            contactsList,
            hasSelf,
            isTransferGroup,
            transferTx,
            feeAmount,
            note,
            latestCreatedAt,
          });
        });

        // 依照時間倒序排序
        displayItems.sort((a, b) => {
          const timeA = a.isSplitGroup ? a.latestCreatedAt : (a.tx.createdAt || a.tx.date);
          const timeB = b.isSplitGroup ? b.latestCreatedAt : (b.tx.createdAt || b.tx.date);
          return timeB.localeCompare(timeA);
        });

        return {
          date,
          transactions: sortTransactionsDesc(groups[date]),
          displayItems,
          dailyBalance: balance,
        };
      });
  }, [transactions, calcDailyBalance, contextAccountId, contextContactId, contextCategoryId, contacts, archivedContacts, accounts, getCategoryName, isBalanceAdjustment]);

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
                {group.displayItems.map((item) => {
                  if (!item.isSplitGroup) {
                    const tx = item.tx;
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => handleRowClick(tx)}
                        className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                      >
                        {/* Item Left (Category, Badges, Note) */}
                        {renderItemLeft ? (
                          renderItemLeft(tx)
                        ) : (
                          <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                            {tx.type === 'transfer' ? (
                              (() => {
                                const fromName = getAccountName(tx.accountId);
                                const toName = getAccountName(tx.toAccountId);
                                return (
                                  <div className="h-5 flex items-center gap-1.5 min-w-0">
                                    <span
                                      title={fromName}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                    >
                                      {fromName}
                                    </span>
                                    <span className="text-muted-foreground/60 text-xs shrink-0 select-none">→</span>
                                    <span
                                      title={toName}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                    >
                                      {toName}
                                    </span>
                                  </div>
                                );
                              })()
                            ) : tx.type === 'loan' && tx.category !== 'advance' ? (
                              (() => {
                                const isLent = contacts?.some(c => c.id === tx.toAccountId) || archivedContacts?.some(c => c.id === tx.toAccountId);
                                const contactId = isLent ? tx.toAccountId : tx.accountId;
                                const contactObj = contacts?.find(c => c.id === contactId)
                                  || archivedContacts?.find(c => c.id === contactId)
                                  || accounts?.find(a => a.id === contactId);
                                const contactName = contactObj?.name || t('common.unknown');

                                return (
                                  <div className="h-5 flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm font-medium leading-none shrink-0">
                                      {isLent ? t('add.lent') : t('add.borrowed')}
                                    </span>
                                    <ContactCapsule name={contactName} group={contactObj?.group} />
                                  </div>
                                );
                              })()
                            ) : tx.type === 'loan' ? (
                              (() => {
                                const isLent = contacts?.some(c => c.id === tx.toAccountId) || archivedContacts?.some(c => c.id === tx.toAccountId);
                                const contactId = isLent ? tx.toAccountId : tx.accountId;
                                const contactObj = contacts?.find(c => c.id === contactId)
                                  || archivedContacts?.find(c => c.id === contactId);
                                const categoryTitle = isLent ? t('add.lent') : t('add.borrowed');

                                return (
                                  <div className="h-5 flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm font-medium leading-none shrink-0">
                                      {categoryTitle}
                                    </span>
                                    {contactObj?.name && (
                                      <ContactCapsule name={contactObj.name} group={contactObj?.group} />
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="h-5 flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-medium leading-none truncate">
                                  {contextCategoryId
                                    ? allCategories?.find(c => c.id === contextCategoryId)?.name || getCategoryName(tx)
                                    : getCategoryName(tx)}
                                </span>
                              </div>
                            )}

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
                                <div className="h-4 flex items-center text-xs text-muted-foreground truncate mt-1 select-text">
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
                          <div className="flex flex-col items-end justify-center shrink-0">
                            <div className="h-5 flex items-center justify-end">
                              {contextAccountId ? (
                                (() => {
                                  const accCurr =
                                    accountCurrencies.get(contextAccountId) ||
                                    activeLedger?.baseCurrency ||
                                    'CNY';
                                  const isOutflow =
                                    (tx.type === 'transfer' || tx.type === 'loan') &&
                                    tx.accountId === contextAccountId;
                                  const isInflow =
                                    (tx.type === 'transfer' || tx.type === 'loan') &&
                                    tx.toAccountId === contextAccountId;

                                  let amt: number;
                                  let dispType: 'expense' | 'income' | 'transfer' | 'neutral' =
                                    tx.type as any;
                                  let showSign = true;

                                  if (isOutflow) {
                                    amt = -(tx.originalAmount ?? tx.amount);
                                    dispType = 'expense';
                                  } else if (isInflow) {
                                    amt = tx.transferInAmount ?? (tx.originalAmount ?? tx.amount);
                                    dispType = 'income';
                                  } else if (tx.type === 'income') {
                                    amt = tx.originalAmount ?? tx.amount;
                                    dispType = 'income';
                                    showSign = false;
                                  } else if (tx.type === 'expense') {
                                    amt = -(tx.originalAmount ?? tx.amount);
                                    dispType = 'expense';
                                  } else {
                                    amt = tx.amount;
                                  }

                                  return (
                                    <AmountDisplay
                                      amount={amt}
                                      baseCurrency={accCurr}
                                      isApproximate={false}
                                      type={dispType}
                                      showSign={showSign}
                                      className="text-sm font-mono leading-none"
                                    />
                                  );
                                })()
                              ) : contextContactId ? (
                                (() => {
                                  const isLending = (tx.type === 'transfer' || tx.type === 'loan') && tx.toAccountId === contextContactId;
                                  const isBorrowing = (tx.type === 'transfer' || tx.type === 'loan') && tx.accountId === contextContactId;
                                  const contactAmt = tx.originalAmount ?? (isLending ? (tx.transferInAmount ?? tx.amount) : tx.amount);

                                  return (
                                    <AmountDisplay
                                      amount={isLending ? -contactAmt : contactAmt}
                                      baseCurrency={tx.originalCurrency || activeLedger?.baseCurrency}
                                      isApproximate={false}
                                      type={
                                        isLending
                                          ? 'expense'
                                          : isBorrowing
                                          ? 'income'
                                          : (tx.type as any)
                                      }
                                      className="text-sm font-mono leading-none"
                                      showSign={true}
                                    />
                                  );
                                })()
                              ) : (
                                (() => {
                                  const info = getDisplayAmountInfo(
                                    tx,
                                    activeLedger?.baseCurrency || 'CNY'
                                  );
                                  return (
                                    <AmountDisplay
                                      amount={info.amount}
                                      baseCurrency={info.currency}
                                      isApproximate={info.isApproximate}
                                      type={info.type}
                                      showSign={info.showSign}
                                      className="text-sm font-mono leading-none"
                                    />
                                  );
                                })()
                              )}
                            </div>

                            {!contextAccountId && tx.type !== 'transfer' && (() => {
                              const wallet = wallets?.find(w => w.id === tx.accountId) || wallets?.find(w => w.id === tx.toAccountId);
                              if (!wallet?.name) return null;
                              return (
                                <div className="h-4 flex items-center justify-end text-xs text-muted-foreground truncate mt-1 max-w-[120px]">
                                  {wallet.name}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </button>
                    );
                  }

                  // 多人分攤組合項目 (SplitGroupItem)
                  if (item.isSplitGroup) {
                    const isExpanded = expandedSplitIds.has(item.id);
                    return (
                      <div key={item.id} className="bg-card">
                        <button
                          type="button"
                          onClick={() => toggleExpandSplit(item.id)}
                          className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-3 overflow-hidden">
                            <div className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                              <ChevronRight className={cn(
                                "w-3.5 h-3.5 transition-transform duration-200",
                                isExpanded && "rotate-90 text-foreground"
                              )} />
                            </div>

                            <div className="flex flex-col justify-center min-w-0 overflow-hidden">
                              <div className="h-5 flex items-center gap-1.5 min-w-0 overflow-hidden">
                                {item.isTransferGroup && item.transferTx ? (
                                  (() => {
                                    const fromName = getAccountName(item.transferTx.accountId);
                                    const toName = getAccountName(item.transferTx.toAccountId);
                                    return (
                                      <div className="h-5 flex items-center gap-1.5 min-w-0">
                                        <span
                                          title={fromName}
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                        >
                                          {fromName}
                                        </span>
                                        <span className="text-muted-foreground/60 text-xs shrink-0 select-none">→</span>
                                        <span
                                          title={toName}
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                        >
                                          {toName}
                                        </span>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <>
                                    <span className="text-sm font-medium leading-none shrink-0">
                                      {item.hasSelf ? item.categoryName : t('add.reimburse', '代付')}
                                    </span>
                                    {item.hasSelf && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-foreground text-background leading-none shrink-0">
                                        {t('add.me', '我')}
                                      </span>
                                    )}
                                    {item.contactsList.map(c => (
                                      <ContactCapsule
                                        key={c.id}
                                        name={c.name}
                                        group={c.group}
                                        maxWidthClass="max-w-[100px]"
                                      />
                                    ))}
                                  </>
                                )}
                              </div>

                              {item.note && (
                                <div className="h-4 flex items-center text-xs text-muted-foreground truncate mt-1 select-text">
                                  {item.note}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end justify-center shrink-0">
                            <div className="h-5 flex items-center justify-end">
                              {item.isTransferGroup && item.transferTx ? (
                                (() => {
                                  const info = getDisplayAmountInfo(
                                    item.transferTx,
                                    activeLedger?.baseCurrency || 'CNY'
                                  );
                                  return (
                                    <AmountDisplay
                                      amount={info.amount}
                                      baseCurrency={info.currency}
                                      isApproximate={false}
                                      type="transfer"
                                      showSign={false}
                                      className="text-sm font-mono leading-none"
                                    />
                                  );
                                })()
                              ) : (
                                <AmountDisplay
                                  amount={item.totalAmount}
                                  baseCurrency={activeLedger?.baseCurrency}
                                  type="expense"
                                  showSign={true}
                                  className="text-sm font-mono leading-none"
                                />
                              )}
                            </div>
                            {!contextAccountId && !item.isTransferGroup && (() => {
                              const mainTx = item.transactions.find(t => t.type === 'expense') || item.transactions[0];
                              const wallet = wallets?.find(w => w.id === mainTx?.accountId);
                              if (!wallet?.name) return null;
                              return (
                                <div className="h-4 flex items-center justify-end text-xs text-muted-foreground truncate mt-1 max-w-[120px]">
                                  {wallet.name}
                                </div>
                              );
                            })()}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="bg-muted/20 border-t border-border divide-y divide-border/50 animate-in slide-in-from-top-1 duration-150">
                            {item.transactions.map(subTx => {
                              const isSelf = subTx.type === 'expense';
                              const targetContact = contacts?.find(c => c.id === subTx.toAccountId)
                                || archivedContacts?.find(c => c.id === subTx.toAccountId)
                                || accounts?.find(a => a.id === subTx.toAccountId);
                              const targetContactName = targetContact?.name || t('common.unknown');

                              return (
                                <button
                                  key={subTx.id}
                                  type="button"
                                  onClick={() => handleRowClick(subTx)}
                                  className="w-full h-16 flex items-center justify-between pl-12 pr-4 transition-colors hover:bg-muted/40 text-left group cursor-pointer"
                                >
                                  {/* 左側：分類/轉帳與膠囊（不顯示備註） */}
                                  <div className="h-5 flex items-center gap-1.5 min-w-0 pr-3 overflow-hidden">
                                    {subTx.type === 'transfer' ? (
                                      (() => {
                                        const fromName = getAccountName(subTx.accountId);
                                        const toName = getAccountName(subTx.toAccountId);
                                        return (
                                          <div className="h-5 flex items-center gap-1.5 min-w-0">
                                            <span
                                              title={fromName}
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                            >
                                              {fromName}
                                            </span>
                                            <span className="text-muted-foreground/60 text-xs shrink-0 select-none">→</span>
                                            <span
                                              title={toName}
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                                            >
                                              {toName}
                                            </span>
                                          </div>
                                        );
                                      })()
                                    ) : item.isTransferGroup ? (
                                      <span className="text-sm font-medium leading-none shrink-0">
                                        {getCategoryName(subTx)}
                                      </span>
                                    ) : isSelf ? (
                                      <>
                                        <span className="text-sm font-medium leading-none shrink-0">
                                          {getCategoryName(subTx)}
                                        </span>
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-foreground text-background leading-none shrink-0">
                                          {t('add.me', '我')}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm font-medium leading-none shrink-0">
                                          {t('add.reimburse', '代付')}
                                        </span>
                                        <ContactCapsule
                                          name={targetContactName}
                                          group={targetContact?.group}
                                        />
                                      </>
                                    )}
                                  </div>

                                  {/* 右側：金額（手續費子交易下方顯示帳戶） */}
                                  <div className="flex flex-col items-end justify-center shrink-0">
                                    <div className="h-5 flex items-center justify-end">
                                      {subTx.type === 'transfer' ? (
                                        (() => {
                                          const info = getDisplayAmountInfo(
                                            subTx,
                                            activeLedger?.baseCurrency || 'CNY'
                                          );
                                          return (
                                            <AmountDisplay
                                              amount={info.amount}
                                              baseCurrency={info.currency}
                                              isApproximate={false}
                                              type="transfer"
                                              className="text-sm font-mono leading-none"
                                            />
                                          );
                                        })()
                                      ) : item.isTransferGroup ? (
                                        <AmountDisplay
                                          amount={subTx.originalAmount ?? subTx.amount}
                                          baseCurrency={subTx.originalCurrency || activeLedger?.baseCurrency}
                                          isApproximate={false}
                                          type="expense"
                                          showSign={true}
                                          className="text-sm font-mono leading-none"
                                        />
                                      ) : (
                                        <AmountDisplay
                                          amount={subTx.amount}
                                          originalCurrency={subTx.originalCurrency}
                                          baseCurrency={activeLedger?.baseCurrency}
                                          type="expense"
                                          showSign={true}
                                          className="text-sm font-mono leading-none"
                                        />
                                      )}
                                    </div>
                                    {item.isTransferGroup && subTx.type === 'expense' && (() => {
                                      const wallet = wallets?.find((w) => w.id === subTx.accountId);
                                      if (!wallet?.name) return null;
                                      return (
                                        <div className="h-4 flex items-center justify-end text-xs text-muted-foreground truncate mt-1 max-w-[120px]">
                                          {wallet.name}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
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
