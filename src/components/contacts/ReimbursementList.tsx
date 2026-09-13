import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  User, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  ArrowDownLeft, 
} from 'lucide-react';
import { getCurrencySymbol } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';
import { SettleReimbursementDialog, type SettleTarget } from './SettleReimbursementDialog';

export function ReimbursementList() {
  const { t } = useTranslation();
  const { transactions } = useTransactions();
  const { contacts } = useAccounts();
  const { categories } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const [statusTab, setStatusTab] = useState<'pending' | 'settled'>('pending');
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

  // All reimbursable transactions
  const reimbursableTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(
      t => !t.deleted && (t.reimbursementStatus === 'pending' || t.reimbursementStatus === 'reimbursed')
    );
  }, [transactions]);

  // Pending transactions
  const pendingTransactions = useMemo(() => {
    return reimbursableTransactions.filter(t => t.reimbursementStatus === 'pending');
  }, [reimbursableTransactions]);

  // Settled transactions
  const settledTransactions = useMemo(() => {
    return reimbursableTransactions.filter(t => t.reimbursementStatus === 'reimbursed');
  }, [reimbursableTransactions]);

  // Total pending amount
  const totalPendingAmount = useMemo(() => {
    return pendingTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [pendingTransactions]);

  // Count of distinct contacts with pending reimbursements
  const pendingContactCount = useMemo(() => {
    const contactSet = new Set(pendingTransactions.map(t => t.reimbursementContactId).filter(Boolean));
    return contactSet.size;
  }, [pendingTransactions]);

  // Group pending transactions by contact
  const pendingGroups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    pendingTransactions.forEach(tx => {
      const cId = tx.reimbursementContactId || 'unknown';
      if (!map.has(cId)) {
        map.set(cId, []);
      }
      map.get(cId)!.push(tx);
    });

    return Array.from(map.entries()).map(([contactId, txs]) => {
      const contact = contacts?.find(c => c.id === contactId);
      const total = txs.reduce((sum, t) => sum + t.amount, 0);
      return {
        contactId,
        contact,
        contactName: contact?.name || t('common.unknown', '未知對象'),
        transactions: txs.sort((a, b) => b.date.localeCompare(a.date)),
        totalAmount: total,
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pendingTransactions, contacts, t]);

  // Open settle modal for either a single transaction or an entire contact group
  const handleOpenSettle = (target: SettleTarget) => {
    setSettleTarget(target);
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Top Overview Metric Card */}
      <div className="border border-border rounded-xl p-5 bg-card text-card-foreground flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Receipt className="size-5" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                {t('reimbursements.totalPending')}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                  {currencySymbol}
                </span>
                <span className="text-3xl font-bold font-mono tracking-tight text-foreground">
                  {totalPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right flex flex-col items-end gap-1">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border border-border">
              {pendingTransactions.length} {t('reimbursements.pendingCount')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {pendingContactCount} {t('reimbursements.contactsCount')}
            </span>
          </div>
        </div>
      </div>

      {/* Segmented Tab: Pending vs Settled */}
      <div className="flex items-center gap-1 border-b border-border pb-3">
        <Button
          type="button"
          size="sm"
          variant={statusTab === 'pending' ? 'default' : 'ghost'}
          onClick={() => setStatusTab('pending')}
          className="rounded-full text-xs font-medium cursor-pointer"
        >
          <Clock className="size-3.5 mr-1" />
          {t('reimbursements.pending')} ({pendingTransactions.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={statusTab === 'settled' ? 'default' : 'ghost'}
          onClick={() => setStatusTab('settled')}
          className="rounded-full text-xs font-medium cursor-pointer"
        >
          <CheckCircle2 className="size-3.5 mr-1" />
          {t('reimbursements.settled')} ({settledTransactions.length})
        </Button>
      </div>

      {/* Pending View */}
      {statusTab === 'pending' && (
        <div className="space-y-4">
          {pendingGroups.length === 0 ? (
            <div className="border border-border rounded-xl p-12 text-center text-sm text-muted-foreground bg-card">
              {t('reimbursements.noPending')}
            </div>
          ) : (
            pendingGroups.map(group => {
              const isOrg = group.contact?.group === 'organization';
              return (
                <div
                  key={group.contactId}
                  className="border border-border rounded-xl overflow-hidden bg-card text-card-foreground flex flex-col"
                >
                  {/* Group Header */}
                  <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-md bg-background border border-border text-muted-foreground">
                        {isOrg ? <Building2 className="size-4" /> : <User className="size-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{group.contactName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            {isOrg ? t('add.contactTypeOrganization') : t('add.contactTypePersonal')}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {t('reimbursements.items', { count: group.transactions.length })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-base font-bold font-mono text-foreground">
                          <AmountDisplay
                            amount={group.totalAmount}
                            baseCurrency={baseCurrency}
                            type="neutral"
                            className="font-bold"
                          />
                        </span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSettle({
                          contactId: group.contactId,
                          contactName: group.contactName,
                          transactions: group.transactions,
                          totalAmount: group.totalAmount,
                        })}
                        className="text-xs h-8 px-3 border-border hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                      >
                        <ArrowDownLeft className="size-3.5 mr-1" />
                        {t('reimbursements.settleAll')}
                      </Button>
                    </div>
                  </div>

                  {/* Transaction Items */}
                  <div className="divide-y divide-border">
                    {group.transactions.map(tx => {
                      const category = categories?.find(c => c.id === tx.category);
                      return (
                        <div
                          key={tx.id}
                          className="px-4 py-3 flex items-center justify-between hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex flex-col min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-none truncate">
                                {category?.name || t('common.uncategorized')}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {tx.date}
                              </span>
                            </div>
                            {tx.note && (
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {tx.note}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <AmountDisplay
                              amount={tx.amount}
                              originalCurrency={tx.originalCurrency}
                              baseCurrency={baseCurrency}
                              type="expense"
                              className="text-sm font-mono text-muted-foreground"
                            />

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenSettle({
                                contactId: group.contactId,
                                contactName: group.contactName,
                                transactions: [tx],
                                totalAmount: tx.amount,
                              })}
                              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                            >
                              {t('reimbursements.settle')}
                            </Button>
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
      )}

      {/* Settled View */}
      {statusTab === 'settled' && (
        <div className="space-y-3">
          {settledTransactions.length === 0 ? (
            <div className="border border-border rounded-xl p-12 text-center text-sm text-muted-foreground bg-card">
              {t('reimbursements.noSettled')}
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border">
              {settledTransactions
                .sort((a, b) => (b.reimbursementSettledAt || b.date).localeCompare(a.reimbursementSettledAt || a.date))
                .map(tx => {
                  const contact = contacts?.find(c => c.id === tx.reimbursementContactId);
                  const category = categories?.find(c => c.id === tx.category);
                  return (
                    <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                      <div className="flex flex-col min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium leading-none truncate">
                            {contact?.name || t('common.unknown')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            • {category?.name || t('common.uncategorized')}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                            {t('reimbursements.settled')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="font-mono">{tx.date}</span>
                          {tx.reimbursementSettledAt && (
                            <span className="text-[11px] opacity-70">
                              {t('reimbursements.settledAt', { date: tx.reimbursementSettledAt.split('T')[0] })}
                            </span>
                          )}
                        </div>
                        {tx.note && (
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {tx.note}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <AmountDisplay
                          amount={tx.amount}
                          originalCurrency={tx.originalCurrency}
                          baseCurrency={baseCurrency}
                          type="neutral"
                          className="text-base font-mono font-medium text-foreground"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Settle Modal */}
      {/* Settle Reimbursement Dialog */}
      <SettleReimbursementDialog
        open={!!settleTarget}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        target={settleTarget}
      />

    </div>
  );
}
