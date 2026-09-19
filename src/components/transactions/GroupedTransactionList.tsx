import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isToday, isYesterday, parseISO, format } from 'date-fns';
import { cn, sortTransactionsDesc } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { ChevronRight } from 'lucide-react';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import type { Transaction } from '@/services/db/db';

export interface SingleTransactionItem {
  isSettlementGroup: false;
  isSplitGroup: false;
  tx: Transaction;
}

export interface SettlementGroupItem {
  isSettlementGroup: true;
  isSplitGroup: false;
  id: string;
  date: string;
  transactions: Transaction[];
  netAmount: number;
  totalRefund: number;
  totalWriteOff: number;
  hasWriteOff: boolean;
  contactId?: string;
  contactName?: string;
  note?: string;
  latestCreatedAt: string;
}

export interface SplitGroupItem {
  isSettlementGroup: false;
  isSplitGroup: true;
  id: string;
  date: string;
  category: string;
  categoryName: string;
  transactions: Transaction[];
  totalAmount: number;
  contactNames: string[];
  hasSelf: boolean;
  note?: string;
  latestCreatedAt: string;
}

export type DisplayListItem = 
  | SingleTransactionItem
  | SettlementGroupItem
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
  const { contacts, wallets } = useAccounts();
  const { allCategories } = useCategories();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();

  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [expandedSettlementIds, setExpandedSettlementIds] = useState<Set<string>>(new Set());
  const [expandedSplitIds, setExpandedSplitIds] = useState<Set<string>>(new Set());

  const toggleExpandSettlement = (id: string) => {
    setExpandedSettlementIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      if (tx.category === 'advance' || tx.reimbursementContactId || tx.reimbursementStatus) {
        return t('add.reimburse', '代付');
      }
      const isLent = contacts?.some(c => c.id === tx.toAccountId);
      return isLent ? t('add.lent') : t('add.borrowed');
    }
    if (tx.isWriteOff) {
      return t('reimbursements.writeOffCategory', '抹零');
    }
    const cat = allCategories?.find(c => c.id === tx.category);
    if (cat?.isSystem) {
      return t('accounts.balanceAdjustment');
    }
    if (cat?.name && (cat.name.includes('差額吸收') || cat.name.includes('差额吸收') || cat.name === '抹零' || cat.name.toLowerCase().includes('write-off'))) {
      return t('reimbursements.writeOffCategory', '抹零');
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

        // 聚合同一分攤群組與同一結算批次
        const splitMap = new Map<string, Transaction[]>();
        const settlementMap = new Map<string, Transaction[]>();
        const normalTxs: Transaction[] = [];

        groups[date].forEach(tx => {
          if (tx.splitGroupId) {
            const list = splitMap.get(tx.splitGroupId) || [];
            list.push(tx);
            splitMap.set(tx.splitGroupId, list);
            return;
          }

          const isRefundChild = tx.type === 'income' && !!tx.reimbursementContactId;
          const isWriteOffChild = tx.type === 'expense' && !!tx.isWriteOff;

          if (tx.settlementId) {
            const list = settlementMap.get(tx.settlementId) || [];
            list.push(tx);
            settlementMap.set(tx.settlementId, list);
          } else if (isRefundChild || isWriteOffChild) {
            // 向後相容歷史資料：同日期、同 contactId、同時間窗口建立的視為同一批次
            const timeKey = tx.createdAt ? tx.createdAt.slice(0, 16) : 'same_time';
            const fallbackKey = `hist_${tx.date}_${tx.reimbursementContactId || 'none'}_${timeKey}`;
            const list = settlementMap.get(fallbackKey) || [];
            list.push(tx);
            settlementMap.set(fallbackKey, list);
          } else {
            normalTxs.push(tx);
          }
        });

        const displayItems: DisplayListItem[] = [];

        // 加入普通交易
        normalTxs.forEach(tx => {
          displayItems.push({ isSettlementGroup: false, isSplitGroup: false, tx });
        });

        // 加入多人分攤組合項目 (SplitGroupItem)
        splitMap.forEach((batchTxs, groupId) => {
          if (batchTxs.length === 0) return;
          const sortedBatch = sortTransactionsDesc(batchTxs);
          const totalAmount = Math.round(batchTxs.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
          const hasSelf = batchTxs.some(t => t.type === 'expense');
          const contactIds = Array.from(new Set(batchTxs.filter(t => t.toAccountId).map(t => t.toAccountId!)));
          const contactNames = contactIds.map(cId => contacts?.find(c => c.id === cId)?.name || cId);
          const selfTx = batchTxs.find(t => t.type === 'expense');
          const mainTx = selfTx || batchTxs[0];
          const catName = getCategoryName(mainTx);
          const note = batchTxs.find(t => t.note)?.note;
          const latestCreatedAt = sortedBatch[0]?.createdAt || sortedBatch[0]?.date;

          displayItems.push({
            isSettlementGroup: false,
            isSplitGroup: true,
            id: groupId,
            date,
            category: mainTx.category,
            categoryName: catName,
            transactions: sortedBatch,
            totalAmount,
            contactNames,
            hasSelf,
            note,
            latestCreatedAt,
          });
        });

        // 加入結算批次組合項目
        settlementMap.forEach((batchTxs, groupId) => {
          if (batchTxs.length === 0) return;
          const sortedBatch = sortTransactionsDesc(batchTxs);
          const totalRefund = batchTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
          const totalWriteOff = batchTxs.filter(t => t.type === 'expense' && t.isWriteOff).reduce((sum, t) => sum + t.amount, 0);
          const netAmount = Math.round((totalRefund - totalWriteOff) * 100) / 100;
          const contactId = batchTxs.find(t => t.reimbursementContactId)?.reimbursementContactId;
          const contact = contacts?.find(c => c.id === contactId);
          const note = batchTxs.find(t => t.note)?.note;
          const latestCreatedAt = sortedBatch[0]?.createdAt || sortedBatch[0]?.date;

          displayItems.push({
            isSettlementGroup: true,
            isSplitGroup: false,
            id: groupId,
            date,
            transactions: sortedBatch,
            netAmount,
            totalRefund,
            totalWriteOff,
            hasWriteOff: totalWriteOff > 0,
            contactId,
            contactName: contact?.name,
            note,
            latestCreatedAt,
          });
        });

        // 依照時間倒序排序
        displayItems.sort((a, b) => {
          const timeA = (a.isSettlementGroup || a.isSplitGroup) ? a.latestCreatedAt : (a.tx.createdAt || a.tx.date);
          const timeB = (b.isSettlementGroup || b.isSplitGroup) ? b.latestCreatedAt : (b.tx.createdAt || b.tx.date);
          return timeB.localeCompare(timeA);
        });

        return {
          date,
          transactions: sortTransactionsDesc(groups[date]),
          displayItems,
          dailyBalance: balance,
        };
      });
  }, [transactions, calcDailyBalance, contextAccountId, contextContactId, contextCategoryId, allCategories, contacts]);

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
                  if (!item.isSettlementGroup && !item.isSplitGroup) {
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
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium leading-none truncate">
                                {contextContactId && tx.reimbursementContactId === contextContactId && tx.type === 'income'
                                  ? t('reimbursements.reimbursementRefund', '代付回款')
                                  : (contextCategoryId
                                      ? allCategories?.find(c => c.id === contextCategoryId)?.name || getCategoryName(tx)
                                      : getCategoryName(tx))}
                              </span>
                              
                              {/* Reimbursement Badges */}
                              {contextContactId && tx.reimbursementContactId === contextContactId && tx.type === 'income' ? (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
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
                                <div className="text-xs text-muted-foreground truncate mt-1">
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
                                className="text-base"
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
                                      type="expense"
                                      className="text-base font-mono"
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
                                      className="text-base font-mono"
                                      showSign={true}
                                    />
                                  );
                                }

                                const isLending = (tx.type === 'transfer' || tx.type === 'loan') && tx.toAccountId === contextContactId;
                                const isBorrowing = (tx.type === 'transfer' || tx.type === 'loan') && tx.accountId === contextContactId;

                                return (
                                  <AmountDisplay
                                    amount={isLending ? -tx.amount : tx.amount}
                                    originalCurrency={tx.originalCurrency}
                                    baseCurrency={activeLedger?.baseCurrency}
                                    type={
                                      isLending
                                        ? 'expense'
                                        : isBorrowing
                                        ? 'income'
                                        : (tx.type as any)
                                    }
                                    className="text-base font-mono"
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
                                type={
                                  tx.type === 'loan'
                                    ? (contacts?.some(c => c.id === tx.toAccountId) ? 'expense' : 'income')
                                    : (tx.type as any)
                                }
                                className="text-base"
                              />
                            )}
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
                              <span className="text-sm font-medium leading-none truncate">
                                {item.categoryName}
                              </span>

                              <div className="text-xs text-muted-foreground truncate mt-1">
                                {item.note ? (
                                  item.note
                                ) : item.hasSelf ? (
                                  t('add.splitSummary', { count: item.contactNames.length, defaultValue: `我和 ${item.contactNames.length} 位對象` })
                                ) : (
                                  t('add.splitSummaryNoSelf', { count: item.contactNames.length, defaultValue: `${item.contactNames.length} 位對象代付` })
                                )}
                                {item.contactNames.length > 0 && ` (${item.contactNames.join('、')})`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center shrink-0">
                            <AmountDisplay
                              amount={item.totalAmount}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="expense"
                              showSign={true}
                              className="text-base font-mono"
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="bg-muted/20 border-t border-border divide-y divide-border/50 animate-in slide-in-from-top-1 duration-150">
                            {item.transactions.map(subTx => {
                              const isSelf = subTx.type === 'expense';
                              const targetContact = contacts?.find(c => c.id === subTx.toAccountId);
                              const subWallet = wallets?.find(w => w.id === subTx.accountId);

                              return (
                                <button
                                  key={subTx.id}
                                  type="button"
                                  onClick={() => handleRowClick(subTx)}
                                  className="w-full h-12 flex items-center justify-between pl-12 pr-4 transition-colors hover:bg-muted/40 text-left group cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-3">
                                    <span className={cn(
                                      "text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono shrink-0",
                                      isSelf
                                        ? "bg-muted text-foreground border-border"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    )}>
                                      {isSelf ? t('add.myExpense', '我的支出') : (targetContact?.name || t('add.reimburse', '代付'))}
                                    </span>

                                    {!isSelf && <ReimbursementBadge transaction={subTx} />}

                                    {subWallet?.name && (
                                      <span className="text-xs text-muted-foreground truncate">
                                        {subWallet.name}
                                      </span>
                                    )}

                                    <span className="text-[10px] font-mono text-muted-foreground/60">
                                      #{subTx.displayId || subTx.id.split('-')[0].toUpperCase()}
                                    </span>
                                  </div>

                                  <div className="flex items-center shrink-0">
                                    <AmountDisplay
                                      amount={subTx.amount}
                                      originalCurrency={subTx.originalCurrency}
                                      baseCurrency={activeLedger?.baseCurrency}
                                      type={isSelf ? 'expense' : 'loan'}
                                      showSign={true}
                                      className="text-sm font-mono"
                                    />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 結算批次組合項目 (SettlementGroupItem)
                  const isExpanded = expandedSettlementIds.has(item.id);
                  return (
                    <div key={item.id} className="bg-card">
                      <button
                        type="button"
                        onClick={() => toggleExpandSettlement(item.id)}
                        className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left"
                      >
                        {/* 左側：前置折疊指示箭頭 + 標題、標籤與次行資訊 */}
                        <div className="flex items-center gap-3 min-w-0 pr-3 overflow-hidden">
                          <div className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                            <ChevronRight className={cn(
                              "w-3.5 h-3.5 transition-transform duration-200",
                              isExpanded && "rotate-90 text-foreground"
                            )} />
                          </div>

                          <div className="flex flex-col justify-center min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium leading-none truncate">
                                {t('reimbursements.settlementGroupTitle', '代付回款')}
                              </span>
                              
                              {/* 回款入帳標籤 */}
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
                                {t('contacts.refundIncome', '回款入帳')}
                              </span>

                              {/* 若含抹零，顯示含抹零標籤 */}
                              {item.hasWriteOff && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono bg-muted text-muted-foreground border-border shrink-0">
                                  {t('reimbursements.includesWriteOff', '含抹零')}
                                </span>
                              )}
                            </div>

                            {/* 次行備註或明細說明 */}
                            <div className="text-xs text-muted-foreground truncate mt-1">
                              {item.note ? (
                                item.note
                              ) : item.contactName ? (
                                `${item.contactName} • ${item.transactions.length} ${t('reimbursements.items', { count: item.transactions.length })}`
                              ) : (
                                `${item.transactions.length} ${t('reimbursements.items', { count: item.transactions.length })}`
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 右側：實收回款與抹零淨額（完全右對齊） */}
                        <div className="flex items-center shrink-0">
                          <AmountDisplay
                            amount={item.netAmount}
                            baseCurrency={activeLedger?.baseCurrency}
                            type="income"
                            showSign={true}
                            className="text-base font-mono"
                          />
                        </div>
                      </button>

                      {/* 手風琴展開抽屜（Vercel 簡約扁平子表格風格） */}
                      {isExpanded && (
                        <div className="bg-muted/20 border-t border-border divide-y divide-border/50 animate-in slide-in-from-top-1 duration-150">
                          {item.transactions.map(subTx => {
                            const isWriteOff = subTx.isWriteOff;
                            const subWallet = wallets?.find(w => w.id === subTx.accountId);
                            return (
                              <button
                                key={subTx.id}
                                type="button"
                                onClick={() => handleRowClick(subTx)}
                                className="w-full h-12 flex items-center justify-between pl-12 pr-4 transition-colors hover:bg-muted/40 text-left group cursor-pointer"
                              >
                                {/* 左側：類型標籤 + 帳戶 + 單號 */}
                                <div className="flex items-center gap-2 min-w-0 pr-3">
                                  <span className={cn(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none font-mono shrink-0",
                                    isWriteOff
                                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  )}>
                                    {isWriteOff ? t('reimbursements.writeOffItem', '抹零') : t('reimbursements.refundItem', '回款入帳')}
                                  </span>

                                  {subWallet?.name && (
                                    <span className="text-xs text-muted-foreground truncate">
                                      {subWallet.name}
                                    </span>
                                  )}

                                  <span className="text-[10px] font-mono text-muted-foreground/60">
                                    #{subTx.displayId || subTx.id.split('-')[0].toUpperCase()}
                                  </span>
                                </div>

                                {/* 右側：金額（精準對齊外層右邊界） */}
                                <div className="flex items-center shrink-0">
                                  <AmountDisplay
                                    amount={subTx.amount}
                                    originalCurrency={subTx.originalCurrency}
                                    baseCurrency={activeLedger?.baseCurrency}
                                    type={isWriteOff ? 'expense' : 'income'}
                                    showSign={true}
                                    className="text-sm font-mono"
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
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
