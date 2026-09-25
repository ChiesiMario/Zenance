import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { useMemo } from 'react';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ReimbursementBadge } from '@/components/transactions/ReimbursementBadge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getCurrencySymbol } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';

interface Props {
  transactionId: string | null;
  onClose: () => void;
}

export function TransactionDetailsDialog({ transactionId, onClose }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { transactions, deleteTransaction } = useTransactions();
  const { allCategories } = useCategories();
  const { accounts, contacts } = useAccounts();
  const { activeLedgerId, setEditingTransactionId } = useAppStore();
  const { ledgers } = useLedgers();

  const selectedTransaction = useMemo(() => {
    if (!transactionId || !transactions) return null;
    return transactions.find(tx => tx.id === transactionId) || null;
  }, [transactionId, transactions]);

  const parentTransaction = useMemo(() => {
    if (!selectedTransaction?.parentId || !transactions) return null;
    return transactions.find(t => t.id === selectedTransaction.parentId) || null;
  }, [selectedTransaction?.parentId, transactions]);

  // 子回款總額與徽章狀態
  const { childRefundsTotal, reimbursementBadgeStatus } = useMemo(() => {
    if (!selectedTransaction?.reimbursementStatus || selectedTransaction.reimbursementStatus === 'none') {
      return { childRefundsTotal: 0, reimbursementBadgeStatus: null };
    }
    const childRefunds = transactions?.filter(
      t => !t.deleted && t.parentId === selectedTransaction.id && t.type === 'income'
    ) || [];
    const total = childRefunds.reduce((sum, t) => sum + t.amount, 0);

    let status: 'pending' | 'reimbursed' | 'partial' | null = selectedTransaction.reimbursementStatus;
    if (selectedTransaction.reimbursementStatus === 'pending' && total > 0 && total < selectedTransaction.amount) {
      status = 'partial';
    }
    return { childRefundsTotal: total, reimbursementBadgeStatus: status };
  }, [selectedTransaction, transactions]);

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  const getAccountName = (accountId: string) => {
    return accounts?.find(a => a.id === accountId)?.name || accountId;
  };

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'transfer') return t('add.transfer');
    if (selectedTransaction?.isWriteOff) {
      return t('reimbursements.writeOffCategory', '抹零');
    }
    if (categoryId === 'advance' || (selectedTransaction?.type === 'loan' && (selectedTransaction.category === 'advance' || selectedTransaction.reimbursementContactId || selectedTransaction.reimbursementStatus))) {
      return t('add.reimburse', '代付');
    }
    if (categoryId === 'loan') {
      if (selectedTransaction?.type === 'loan') {
        const isLent = contacts?.some(c => c.id === selectedTransaction.toAccountId);
        return isLent ? t('add.lent') : t('add.borrowed');
      }
      return t('add.loan');
    }
    const cat = allCategories?.find(c => c.id === categoryId);
    if (cat?.isSystem) {
      return t('accounts.balanceAdjustment');
    }
    if (cat?.name && (cat.name.includes('差額吸收') || cat.name.includes('差额吸收') || cat.name === '抹零' || cat.name.toLowerCase().includes('write-off'))) {
      return t('reimbursements.writeOffCategory', '抹零');
    }
    return cat?.name || categoryId;
  };

  const displayRefId = useMemo(() => {
    if (!selectedTransaction) return '';
    return selectedTransaction.displayId || selectedTransaction.id.split('-')[0].toUpperCase();
  }, [selectedTransaction]);

  const hasValidNote = useMemo(() => {
    if (!selectedTransaction?.note) return false;
    const cat = allCategories?.find(c => c.id === selectedTransaction.category);
    const isAdj = !!cat?.isSystem;
    const isDefaultNote = selectedTransaction.note === t('accounts.balanceAdjustmentNote') ||
      selectedTransaction.note === '手動餘額調整' ||
      selectedTransaction.note === '手动余额调整' ||
      selectedTransaction.note === 'Manual Balance Adjustment';
    return !(isAdj && isDefaultNote);
  }, [selectedTransaction, allCategories, t]);

  const handleDelete = async () => {
    if (!transactionId || !selectedTransaction) return;

    const isReimbursementRefund = selectedTransaction.type === 'income' && !!selectedTransaction.reimbursementContactId;
    const description = isReimbursementRefund
      ? t('reimbursements.deleteRefundConfirm')
      : t('dashboard.deleteTransactionConfirm');

    const confirmed = await confirm({
      title: t('dashboard.deleteTransaction'),
      description,
      confirmText: t('common.delete'),
      variant: 'destructive',
    });

    if (!confirmed) return;

    await deleteTransaction(transactionId);
    onClose();
  };

  if (!selectedTransaction) return null;

  return (
    <Dialog open={!!transactionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[min(350px,calc(100%-2rem))] sm:max-w-[350px] p-0 overflow-hidden border border-border bg-card rounded-2xl shadow-none text-card-foreground outline-none"
      >
        {/* 頂部 Header：Logo + 交易 ID 與日期 */}
        <div className="p-6 pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Logo size={16} showBorder={false} className="rounded shrink-0" />
              <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground">
                #{displayRefId}
              </span>
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              {t('receipt.voucherTitle', '交易憑證')}
            </DialogTitle>
          </div>

          <div className="text-right font-mono shrink-0 pt-0.5">
            <span className="text-xs font-medium text-muted-foreground block">
              {selectedTransaction.date}
            </span>
          </div>
        </div>

        {/* 核心金額區塊 (Hero Amount Box) */}
        <div className="px-6 py-1">
          <div className="rounded-xl bg-muted/40 border border-border/70 p-4 text-center">
            {/* 帳戶與輔助標籤 */}
            <div className="flex items-center justify-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-border bg-background text-foreground font-medium max-w-[260px] truncate">
                {(selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan') ? (
                  `${getAccountName(selectedTransaction.accountId)} → ${selectedTransaction.toAccountId ? getAccountName(selectedTransaction.toAccountId) : '-'}`
                ) : (
                  getAccountName(selectedTransaction.accountId)
                )}
              </span>
              {selectedTransaction.parentId && (
                <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                  {t('dashboard.subTransaction')}
                </span>
              )}
              {selectedTransaction.isGift && (
                <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                  {t('add.gift', '贈與')}
                </span>
              )}
              {reimbursementBadgeStatus && (
                <ReimbursementBadge status={reimbursementBadgeStatus} />
              )}
            </div>

            {/* 超大等寬金額 */}
            <div className="text-5xl font-mono tracking-tighter font-extrabold select-text py-1 text-foreground">
              <AmountDisplay 
                amount={selectedTransaction.amount} 
                originalCurrency={selectedTransaction.originalCurrency} 
                baseCurrency={activeLedger?.baseCurrency} 
                type={selectedTransaction.type as any} 
              />
            </div>

            {/* 分類名稱提示 */}
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {getCategoryName(selectedTransaction.category)}
            </div>
          </div>
        </div>

        {/* 票券左右半圓缺口與穿孔線 (Ticket Notches & Perforation) */}
        <div className="relative py-2.5 flex items-center justify-center my-0.5 -mx-6">
          <div className="absolute -left-[9px] w-[18px] h-[18px] rounded-full bg-background border border-border" />
          <div className="w-full border-b border-dashed border-border" />
          <div className="absolute -right-[9px] w-[18px] h-[18px] rounded-full bg-background border border-border" />
        </div>

        {/* 明細表格清單 (Breakdown Grid) */}
        <div className="px-6 py-2 space-y-2.5 text-sm">
          {/* 記帳分類 */}
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">{t('add.category')}</span>
            <span className="font-medium text-right">
              {getCategoryName(selectedTransaction.category)}
            </span>
          </div>
          {/* 原幣金額與匯率 */}
          {selectedTransaction.originalCurrency && selectedTransaction.originalCurrency !== activeLedger?.baseCurrency && (
            <>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">{t('dashboard.original')}</span>
                <span className="font-mono font-medium">
                  {selectedTransaction.originalAmount?.toLocaleString()} {selectedTransaction.originalCurrency}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">{t('dashboard.rate')}</span>
                <span className="font-mono font-medium">
                  {selectedTransaction.exchangeRate?.toFixed(4)}
                </span>
              </div>
            </>
          )}

          {/* 轉帳到款金額 */}
          {selectedTransaction.transferInAmount !== undefined && selectedTransaction.transferInAmount > 0 && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">{t('add.inflow', '到款')}</span>
              <span className="font-mono font-medium">
                {selectedTransaction.transferInAmount?.toLocaleString()} {
                  selectedTransaction.type === 'transfer'
                    ? (accounts?.find(a => a.id === selectedTransaction.toAccountId)?.currency || activeLedger?.baseCurrency)
                    : (selectedTransaction.originalCurrency === activeLedger?.baseCurrency
                        ? (accounts?.find(a => a.id === selectedTransaction.toAccountId)?.currency || activeLedger?.baseCurrency)
                        : activeLedger?.baseCurrency)
                }
              </span>
            </div>
          )}

          {/* 日期 */}
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">{t('add.date')}</span>
            <span className="font-medium">{selectedTransaction.date}</span>
          </div>

          {/* 帳戶資訊 */}
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">
              {(selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan')
                ? (selectedTransaction.type === 'transfer'
                    ? t('dashboard.transferDetail')
                    : selectedTransaction.isGift
                    ? t('add.gift', '贈與')
                    : selectedTransaction.reimbursementContactId
                    ? t('add.reimburse', '代付')
                    : t('add.loan'))
                : t('add.account')}
            </span>
            <span className="font-medium text-right truncate max-w-[220px]">
              {(selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan') ? (
                `${getAccountName(selectedTransaction.accountId)} → ${selectedTransaction.toAccountId ? getAccountName(selectedTransaction.toAccountId) : '-'}`
              ) : (
                getAccountName(selectedTransaction.accountId)
              )}
            </span>
          </div>

          {/* 母交易關聯 */}
          {selectedTransaction.parentId && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">{t('dashboard.parentTransaction')}</span>
              <span className="font-medium text-right text-sm">
                {parentTransaction ? (
                  <span className="flex items-center gap-1.5 justify-end">
                    <span>{getCategoryName(parentTransaction.category)}</span>
                    <span className="font-mono text-muted-foreground">
                      #{parentTransaction.displayId || parentTransaction.id.split('-')[0].toUpperCase()}
                    </span>
                  </span>
                ) : (
                  <span className="font-mono text-muted-foreground">
                    #{selectedTransaction.parentId.split('-')[0].toUpperCase()}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 報銷管理狀態 */}
          {selectedTransaction.reimbursementStatus && selectedTransaction.reimbursementStatus !== 'none' && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">{t('reimbursements.title', '收款管理')}</span>
              <div>
                {reimbursementBadgeStatus && (
                  <ReimbursementBadge status={reimbursementBadgeStatus} />
                )}
              </div>
            </div>
          )}

          {/* 部分報銷待收餘額 */}
          {reimbursementBadgeStatus === 'partial' && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">{t('reimbursements.remainingPending')}</span>
              <span className="font-mono font-medium text-foreground text-sm">
                {currencySymbol}{(Math.max(0, Math.round((selectedTransaction.amount - childRefundsTotal) * 100) / 100)).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* 備註便簽區 (Note Section) */}
        {hasValidNote && (
          <div className="px-6 py-2">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/70 text-sm">
              <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">
                {t('add.note')}
              </span>
              <p className="font-sans text-sm text-foreground select-text break-words leading-relaxed">
                {selectedTransaction.note}
              </p>
            </div>
          </div>
        )}

        {/* 彈窗底端操作列 (Dialog Actions) */}
        <div className="px-6 py-3.5 mt-2 border-t border-border bg-muted/20 flex items-center justify-between gap-3 text-xs">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2 text-xs font-medium cursor-pointer"
            onClick={handleDelete}
          >
            {t('dashboard.delete')}
          </Button>

          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" size="sm" type="button" />}>
              {t('dashboard.close')}
            </DialogClose>
            <Button
              size="sm"
              className="cursor-pointer font-medium"
              onClick={() => {
                setEditingTransactionId(selectedTransaction.id);
                onClose();
              }}
            >
              {t('dashboard.edit', '編輯')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
