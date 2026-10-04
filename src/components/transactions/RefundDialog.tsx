import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountSelectDialog } from '@/components/accounts/AccountSelectDialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { getCurrencySymbol, cn, formatAmountNumber, getLocalDateString } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, FileText } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { AmountInput } from '@/components/ui/AmountInput';

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  maxRefundable: number;
  onSuccess?: () => void;
}

export function RefundDialog({
  open,
  onOpenChange,
  transaction,
  maxRefundable,
  onSuccess,
}: RefundDialogProps) {
  const { t } = useTranslation();
  const { allWallets, wallets, accounts } = useAccounts();
  const { getOrCreateSystemRefundCategory } = useCategories();
  const { addTransaction } = useTransactions();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();

  const [accountId, setAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(getLocalDateString());
  const [note, setNote] = useState<string>('');
  const [isAccountSelectOpen, setIsAccountSelectOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeLedger = ledgers?.find((l) => l.id === activeLedgerId);
  const currency = transaction?.originalCurrency || activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(currency);

  const isExpenseRefund = transaction?.type === 'expense';

  // Initialize values when dialog opens or transaction changes
  useEffect(() => {
    if (open && transaction) {
      setAccountId(transaction.accountId);
      setAmountStr(maxRefundable > 0 ? String(maxRefundable) : '');
      setDate(getLocalDateString());
      
      const defaultNote = isExpenseRefund
        ? t('refund.defaultExpenseRefundNote', {
            target: transaction.note || `#${transaction.displayId || transaction.id.slice(0, 6)}`,
          })
        : t('refund.defaultIncomeRefundNote', {
            target: transaction.note || `#${transaction.displayId || transaction.id.slice(0, 6)}`,
          });
      setNote(defaultNote);
    }
  }, [open, transaction, maxRefundable, isExpenseRefund, t]);

  const selectedWallet = useMemo(() => {
    const list = allWallets || wallets || accounts || [];
    return list.find((w) => w.id === accountId);
  }, [allWallets, wallets, accounts, accountId]);

  const numAmount = parseFloat(amountStr);
  const isAmountValid = !isNaN(numAmount) && numAmount > 0;
  const isAmountExceeded = !isNaN(numAmount) && numAmount > maxRefundable + 0.0001;

  const handleFullRefund = () => {
    setAmountStr(String(maxRefundable));
    triggerHaptic('light');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!transaction || isSubmitting || !isAmountValid || isAmountExceeded || !accountId) return;

    setIsSubmitting(true);

    try {
      // 支出退款以收入形式記帳；收入退款以支出形式記帳
      const refundType = isExpenseRefund ? 'income' : 'expense';
      const categoryName = t('refund.systemCategory', '退款');
      const refundCategory = await getOrCreateSystemRefundCategory(refundType, categoryName);

      if (!refundCategory) {
        throw new Error('Failed to create refund category');
      }

      // 計算本位幣折算金額
      const rate = transaction.exchangeRate || 1;
      const baseAmount = rate > 0 ? numAmount / rate : numAmount;

      await addTransaction({
        parentId: transaction.id,
        budgetId: transaction.budgetId, // 繼承主交易預算設定
        amount: Math.round(baseAmount * 100) / 100,
        originalAmount: Math.round(numAmount * 100) / 100,
        originalCurrency: currency,
        exchangeRate: rate,
        type: refundType,
        category: refundCategory.id,
        accountId,
        date,
        note: note.trim() || undefined,
      });

      triggerHaptic('success');
      toast(t('refund.success', '已成功建立退款記錄'));

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Failed to issue refund:', err);
      toast(String(err));
      triggerHaptic('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-full max-w-[350px] sm:max-w-[350px] p-5 sm:rounded-2xl border-border bg-background shadow-none"
          showCloseButton={true}
        >
          <DialogHeader className="space-y-1 text-left pr-8">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono border',
                  isExpenseRefund
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                )}
              >
                {isExpenseRefund ? (
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                )}
              </span>
              <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
                {t('refund.dialogTitle', '辦理退款')}
              </DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              #{transaction.displayId || transaction.id.slice(0, 8)} ·{' '}
              {isExpenseRefund
                ? t('refund.targetAccountExpense', '收款帳戶')
                : t('refund.targetAccountIncome', '扣款帳戶')}
            </p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* 金額輸入區塊 */}
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t('refund.amount', '退款金額')}
                </span>
                <button
                  type="button"
                  onClick={handleFullRefund}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  {t('refund.fullRefund', '全額退款')}
                </button>
              </div>

              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-xl font-mono font-medium transition-colors shrink-0',
                    isAmountExceeded ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {currencySymbol}
                </span>
                <AmountInput
                  value={amountStr}
                  onValueChange={(val) => {
                    setAmountStr(val);
                  }}
                  currencySymbol={currencySymbol}
                  placeholder="0.00"
                  className={cn(
                    'flex-1 border-none bg-transparent p-0 text-2xl font-bold font-mono tracking-tight shadow-none focus-visible:ring-0 h-auto transition-colors',
                    isAmountExceeded ? 'text-destructive' : 'text-foreground'
                  )}
                />
              </div>

              <div
                className={cn(
                  'text-[11px] font-mono flex items-center justify-between pt-1 border-t border-border/50 transition-colors',
                  isAmountExceeded ? 'text-destructive font-medium' : 'text-muted-foreground/80'
                )}
              >
                <span>{t('refund.maxRefundable', '剩餘可退上限')}</span>
                <span
                  className={cn(
                    'font-semibold',
                    isAmountExceeded ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {currencySymbol} {formatAmountNumber(maxRefundable)}
                </span>
              </div>
            </div>

            {/* 帳戶選擇 */}
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {isExpenseRefund
                  ? t('refund.targetAccountExpense', '收款帳戶')
                  : t('refund.targetAccountIncome', '扣款帳戶')}
              </label>
              <button
                type="button"
                onClick={() => setIsAccountSelectOpen(true)}
                className="w-full flex items-center justify-between px-3 h-10 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors text-left text-sm"
              >
                <div className="flex items-center gap-2 truncate">
                  <WalletIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium text-foreground">
                    {selectedWallet?.name || t('add.selectAccount', '選擇帳戶')}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground uppercase font-mono">
                  {selectedWallet?.currency || currency}
                </span>
              </button>
            </div>

            {/* 日期選擇 */}
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {t('refund.date', '退款日期')}
              </label>
              <DatePicker
                value={date}
                onChange={(newDate) => setDate(newDate)}
              />
            </div>

            {/* 備註 */}
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {t('refund.note', '備註')}
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('refund.note', '備註')}
                  className="text-sm h-10 border-border bg-background shadow-none pr-8"
                />
                <FileText className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* 操作按鈕 */}
            <DialogFooter className="pt-2 gap-2 sm:gap-2 flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border shadow-none h-9 text-xs px-2 truncate"
              >
                {t('refund.cancel', '取消')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isAmountValid || isAmountExceeded || !accountId}
                className="flex-1 bg-foreground text-background hover:bg-foreground/90 font-medium shadow-none h-9 text-xs disabled:opacity-50 disabled:cursor-not-allowed px-2 truncate"
              >
                {isSubmitting ? '...' : t('refund.confirm', '確認退款')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 帳戶選擇面板 */}
      <AccountSelectDialog
        open={isAccountSelectOpen}
        onOpenChange={setIsAccountSelectOpen}
        selectedAccountId={accountId}
        onSelectAccount={(acc) => {
          if (acc?.id) setAccountId(acc.id);
          setIsAccountSelectOpen(false);
        }}
        filterType="wallet"
      />
    </>
  );
}
