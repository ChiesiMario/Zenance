import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import type { Transaction } from '@/services/db/db';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { getCurrencySymbol, cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export interface SettleTarget {
  contactId: string;
  contactName: string;
  transactions: (Transaction & { remainingAmount?: number })[];
  totalAmount: number;
}

interface SettleReimbursementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SettleTarget | null;
  onSettled?: () => void;
}

export function SettleReimbursementDialog({
  open,
  onOpenChange,
  target,
  onSettled,
}: SettleReimbursementDialogProps) {
  const { t } = useTranslation();
  const { wallets } = useAccounts();
  const { addTransaction, updateTransaction } = useTransactions();
  const { categories, addCategory } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  // 狀態管理
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [writeOffDifference, setWriteOffDifference] = useState<boolean>(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [settleDate, setSettleDate] = useState<string>('');
  const [settleNote, setSettleNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog 開啟時初始化
  useEffect(() => {
    if (open && target) {
      const allIds = new Set(target.transactions.map(tx => tx.id));
      setSelectedTxIds(allIds);
      setReceivedAmount(target.totalAmount.toString());
      setWriteOffDifference(false);

      if (wallets && wallets.length > 0) {
        const defaultWallet = wallets.find(w => w.isDefault) || wallets[0];
        setSelectedWalletId(defaultWallet.id);
      }
      setSettleDate(new Date().toISOString().split('T')[0]);
      setSettleNote(t('reimbursements.reimbursementRefundNote', { name: target.contactName }));
      setIsSubmitting(false);
    }
  }, [open, target, wallets, t]);

  // 單筆項目的實質待結算金額
  const getTxPendingAmount = (tx: Transaction & { remainingAmount?: number }) => {
    return tx.remainingAmount !== undefined ? tx.remainingAmount : tx.amount;
  };

  // 已勾選的待報銷項目
  const selectedTransactions = useMemo(() => {
    if (!target) return [];
    return target.transactions.filter(tx => selectedTxIds.has(tx.id));
  }, [target, selectedTxIds]);

  // 勾選項目總額（四捨五入防浮點數誤差）
  const selectedTotal = useMemo(() => {
    const sum = selectedTransactions.reduce((acc, tx) => acc + getTxPendingAmount(tx), 0);
    return Math.round(sum * 100) / 100;
  }, [selectedTransactions]);

  // 切換單筆勾選
  const toggleSelectTx = (id: string) => {
    setSelectedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      // 自動同步金額
      const nextSelected = (target?.transactions || []).filter(tx => next.has(tx.id));
      const nextTotal = Math.round(nextSelected.reduce((acc, tx) => acc + getTxPendingAmount(tx), 0) * 100) / 100;
      setReceivedAmount(nextTotal > 0 ? nextTotal.toString() : '');
      return next;
    });
  };

  // 全選 / 取消全選
  const toggleSelectAll = () => {
    if (!target) return;
    if (selectedTxIds.size === target.transactions.length) {
      setSelectedTxIds(new Set());
      setReceivedAmount('');
    } else {
      const allIds = new Set(target.transactions.map(tx => tx.id));
      setSelectedTxIds(allIds);
      setReceivedAmount(target.totalAmount.toString());
    }
  };

  // 差額分析
  const parsedAmount = Math.max(0, parseFloat(receivedAmount) || 0);
  const diff = Math.max(0, Math.round((selectedTotal - parsedAmount) * 100) / 100);
  const isOverpaid = parsedAmount > selectedTotal;
  const isDiffOver10Percent = selectedTotal > 0 && diff > Math.round(selectedTotal * 0.1 * 100) / 100 + 0.0001;
  const canWriteOff = diff > 0 && !isDiffOver10Percent;

  if (!open || !target) return null;

  const handleConfirmSettle = async () => {
    if (!target || !selectedWalletId || isSubmitting || parsedAmount <= 0 || isOverpaid || selectedTxIds.size === 0) return;

    try {
      setIsSubmitting(true);

      // 1. 查找或建立「代付回款」專用收入分類
      let incomeCategory = categories?.find(
        c => c.type === 'income' && (c.name.includes('代付') || c.name.includes('報銷') || c.name.includes('报销') || c.name.toLowerCase().includes('reimburse') || c.name.toLowerCase().includes('collection'))
      );

      if (!incomeCategory) {
        const firstIncome = categories?.find(c => c.type === 'income');
        if (firstIncome) {
          incomeCategory = firstIncome;
        } else {
          incomeCategory = await addCategory(t('reimbursements.reimbursementRefund', '代付回款'), 'income');
        }
      }

      // 查找或建立「抹零」專用支出分類
      let writeOffCategory = categories?.find(
        c => c.type === 'expense' && (c.name.includes('抹零') || c.name.includes('差額吸收') || c.name.includes('差额吸收') || c.name.toLowerCase().includes('write-off'))
      );

      if (!writeOffCategory && canWriteOff && writeOffDifference) {
        writeOffCategory = await addCategory(t('reimbursements.writeOffCategory', '抹零'), 'expense');
      }

      const now = new Date().toISOString();
      const settlementId = uuidv4();

      // 按時間順序先進先出 (FIFO) 依序分配回款子交易
      const sortedTransactions = [...selectedTransactions].sort((a, b) => a.date.localeCompare(b.date));
      let remainingToCover = parsedAmount;

      for (const tx of sortedTransactions) {
        const txPending = getTxPendingAmount(tx);
        if (txPending <= 0) continue;

        // 該筆交易本次分配到的實收回款金額
        const allocated = Math.min(remainingToCover, txPending);

        if (allocated > 0) {
          // 在該筆待報銷支出底下新增「回款收入子交易」
          await addTransaction({
            parentId: tx.id,
            settlementId,
            amount: allocated,
            originalAmount: allocated,
            originalCurrency: baseCurrency,
            exchangeRate: 1,
            type: 'income',
            category: incomeCategory?.id || 'income',
            accountId: selectedWalletId,
            note: settleNote.trim() || t('reimbursements.reimbursementRefundNote', { name: target.contactName }),
            date: settleDate,
            reimbursementContactId: target.contactId,
          });

          remainingToCover = Math.round((remainingToCover - allocated) * 100) / 100;
        }

        const remainingAfterAllocation = Math.round((txPending - allocated) * 100) / 100;

        if (remainingAfterAllocation === 0) {
          // 該筆已全額報銷結清
          await updateTransaction(tx.id, {
            reimbursementStatus: 'reimbursed',
            reimbursementSettledAt: now,
          });
        } else if (canWriteOff && writeOffDifference) {
          // 選擇抹零支出：
          // 1. 原父待報銷支出扣減抹零差額（使其與回款剛好沖銷平衡），並標記為已報銷
          const newParentAmount = Math.round((tx.amount - remainingAfterAllocation) * 100) / 100;
          const newParentOriginalAmount = Math.round((tx.originalAmount - remainingAfterAllocation) * 100) / 100;

          await updateTransaction(tx.id, {
            amount: newParentAmount,
            originalAmount: newParentOriginalAmount,
            reimbursementStatus: 'reimbursed',
            reimbursementSettledAt: now,
          });

          // 2. 生成一筆「個人支出（type: expense）」子交易，分類歸入「抹零」
          await addTransaction({
            parentId: tx.id,
            settlementId,
            amount: remainingAfterAllocation,
            originalAmount: remainingAfterAllocation,
            originalCurrency: tx.originalCurrency || baseCurrency,
            exchangeRate: tx.exchangeRate || 1,
            type: 'expense',
            category: writeOffCategory?.id || tx.category,
            accountId: tx.accountId,
            isWriteOff: true,
            note: t('reimbursements.writeOffNote', '報銷抹零'),
            date: settleDate,
            reimbursementContactId: target.contactId,
          });
        } else {
          // 部分回款，未抹零：維持 pending 狀態
          await updateTransaction(tx.id, {
            reimbursementStatus: 'pending',
          });
        }
      }

      onOpenChange(false);
      onSettled?.();
    } catch (err) {
      console.error('Failed to settle reimbursement:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedWallet = wallets?.find(w => w.id === selectedWalletId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">{t('reimbursements.settleModalTitle')}</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* 無邊界實收金額輸入區 */}
          <div className="flex flex-col items-center justify-center pt-2 pb-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
              {t('reimbursements.receivedAmount')}
            </span>
            <div className="flex items-center justify-center font-mono font-bold tracking-tight text-foreground">
              <span className="text-2xl mr-1 text-muted-foreground">{currencySymbol}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                placeholder="0.00"
                className="w-48 text-center text-4xl font-bold font-mono tracking-tight bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
            {isOverpaid && (
              <p className="text-xs text-destructive mt-1">
                {t('reimbursements.cannotExceedTotal')}
              </p>
            )}
            {selectedTxIds.size === 0 && (
              <p className="text-xs text-destructive mt-1">
                {t('reimbursements.mustSelectAtLeastOne')}
              </p>
            )}
          </div>

          {/* 待結算明細勾選清單 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t('reimbursements.pendingItems')} ({selectedTxIds.size}/{target.transactions.length})
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {selectedTxIds.size === target.transactions.length
                  ? t('reimbursements.deselectAll')
                  : t('reimbursements.selectAll')}
              </button>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden max-h-40 overflow-y-auto">
              {target.transactions.map(tx => {
                const isChecked = selectedTxIds.has(tx.id);
                return (
                  <div
                    key={tx.id}
                    onClick={() => toggleSelectTx(tx.id)}
                    className={cn(
                      "flex items-center justify-between p-2.5 transition-colors cursor-pointer hover:bg-muted/20 select-none",
                      isChecked ? "bg-muted/10" : "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                        isChecked ? "bg-foreground border-foreground text-background" : "border-border"
                      )}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">
                          {tx.note || t('reimbursements.pending')}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {tx.date}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-mono text-xs font-medium text-foreground">
                        {currencySymbol}{getTxPendingAmount(tx).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {tx.remainingAmount !== undefined && tx.remainingAmount < tx.amount && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {t('reimbursements.remainingPending')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center px-1 text-[11px] font-mono text-muted-foreground">
              <span>{t('reimbursements.selectedTotal')}</span>
              <span className="text-foreground font-medium">
                {currencySymbol}{selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 差額提醒與抹零選項 */}
          {diff > 0 && (
            <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t('reimbursements.difference')}</span>
                <span className="font-mono font-medium text-foreground">
                  {currencySymbol}{diff.toFixed(2)} ({((diff / selectedTotal) * 100).toFixed(1)}%)
                </span>
              </div>

              {canWriteOff ? (
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={writeOffDifference}
                    onChange={(e) => setWriteOffDifference(e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-0 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {t('reimbursements.writeOffDifference', { amount: `${currencySymbol}${diff.toFixed(2)}` })}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {t('reimbursements.writeOffHint')}
                    </span>
                  </div>
                </label>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {t('reimbursements.autoKeepPendingHint')}
                </p>
              )}
            </div>
          )}

          {/* Vercel Usage 風格設定清單卡片 */}
          <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
            {/* 收款帳戶 */}
            <div className="flex items-center justify-between p-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t('reimbursements.receivingAccount')}
              </span>
              <Select value={selectedWalletId} onValueChange={(val) => { if (val) setSelectedWalletId(val); }}>
                <SelectTrigger className="!h-auto !py-0 !px-0 !border-none !bg-transparent shadow-none focus-visible:border-none focus-visible:ring-0 text-sm font-medium justify-end gap-1.5 cursor-pointer max-w-[180px]">
                  <SelectValue className="flex-none text-right truncate">
                    {selectedWallet?.name || t('reimbursements.receivingAccount')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {wallets?.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 收款日期 */}
            <div className="flex items-center justify-between p-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t('reimbursements.settleDate')}
              </span>
              <div className="w-36">
                <DatePicker
                  value={settleDate}
                  onChange={setSettleDate}
                />
              </div>
            </div>

            {/* 交易備註 */}
            <div className="flex items-center justify-between p-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                {t('reimbursements.note')}
              </span>
              <input
                type="text"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                placeholder={t('reimbursements.notePlaceholder')}
                className="text-sm font-medium text-right bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 w-full pl-4"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:gap-2 pt-2">
          <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            onClick={handleConfirmSettle}
            disabled={!selectedWalletId || !settleDate || parsedAmount <= 0 || isOverpaid || selectedTxIds.size === 0 || isSubmitting}
            className="cursor-pointer"
          >
            {isSubmitting ? t('add.saving') : t('reimbursements.confirmSettle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
