import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import type { Transaction } from '@/services/db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/utils';

export interface SettleTarget {
  contactId: string;
  contactName: string;
  transactions: Transaction[];
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

  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [settleDate, setSettleDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (wallets && wallets.length > 0) {
        const defaultWallet = wallets.find(w => w.isDefault) || wallets[0];
        setSelectedWalletId(defaultWallet.id);
      }
      setSettleDate(new Date().toISOString().split('T')[0]);
      setIsSubmitting(false);
    }
  }, [open, wallets]);

  if (!open || !target) return null;

  const handleConfirmSettle = async () => {
    if (!target || !selectedWalletId || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // 1. Find or create an income category for reimbursement refund
      let incomeCategory = categories?.find(
        c => c.type === 'income' && (c.name.includes('報銷') || c.name.includes('报销') || c.name.toLowerCase().includes('reimburse'))
      );

      if (!incomeCategory) {
        const firstIncome = categories?.find(c => c.type === 'income');
        if (firstIncome) {
          incomeCategory = firstIncome;
        } else {
          incomeCategory = await addCategory(t('reimbursements.reimbursementRefund', '報銷回款'), 'income');
        }
      }

      const now = new Date().toISOString();

      // 2. Add an Income transaction for the refund, linking reimbursementContactId
      await addTransaction({
        amount: target.totalAmount,
        originalAmount: target.totalAmount,
        originalCurrency: baseCurrency,
        exchangeRate: 1,
        type: 'income',
        category: incomeCategory?.id || 'income',
        accountId: selectedWalletId,
        note: t('reimbursements.reimbursementRefundNote', { name: target.contactName }),
        date: settleDate,
        reimbursementContactId: target.contactId,
      });

      // 3. Mark the expense transactions as reimbursed
      for (const tx of target.transactions) {
        await updateTransaction(tx.id, {
          reimbursementStatus: 'reimbursed',
          reimbursementSettledAt: now,
        });
      }

      onOpenChange(false);
      onSettled?.();
    } catch (err) {
      console.error('Failed to settle reimbursement:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm border border-border bg-background p-6 rounded-2xl flex flex-col gap-4 shadow-none">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <h3 className="font-semibold text-base tracking-tight">
            {t('reimbursements.settleModalTitle')}
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Details Card */}
        <div className="border border-border rounded-xl p-4 bg-muted/30 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{t('add.reimburseTarget')}</span>
            <span className="font-medium text-foreground">{target.contactName}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{t('reimbursements.amount')}</span>
            <span className="font-mono text-base font-bold text-foreground">
              {currencySymbol}{target.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{t('reimbursements.items', { count: target.transactions.length })}</span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {target.transactions.length}
            </span>
          </div>
        </div>

        {/* Receiving Account Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('reimbursements.receivingAccount')}
          </label>
          <Select value={selectedWalletId} onValueChange={(val) => val && setSelectedWalletId(val)}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder={t('reimbursements.receivingAccount')} />
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

        {/* Settle Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('reimbursements.settleDate')}
          </label>
          <div className="relative">
            <Input
              type="date"
              value={settleDate}
              onChange={(e) => setSettleDate(e.target.value)}
              className="text-sm font-mono"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="cursor-pointer"
          >
            {t('add.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirmSettle}
            disabled={!selectedWalletId || !settleDate || isSubmitting}
            className="cursor-pointer font-medium"
          >
            {isSubmitting ? t('add.saving') : t('reimbursements.confirmSettle')}
          </Button>
        </div>
      </div>
    </div>
  );
}
