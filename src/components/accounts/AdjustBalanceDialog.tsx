import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/AmountInput';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { getLocalDateString, cn } from '@/lib/utils';

export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  currentBalance: number;
  currency: string;
  onSuccess?: () => void;
}

export const AdjustBalanceDialog: React.FC<AdjustBalanceDialogProps> = ({
  open,
  onOpenChange,
  accountId,
  currentBalance,
  currency,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { addTransaction } = useTransactions();
  const { getOrCreateSystemBalanceAdjustmentCategory } = useCategories();

  const [newBalanceStr, setNewBalanceStr] = useState('');
  const adjustInputRef = useRef<HTMLInputElement>(null);


  // 當彈窗開啟時同步初始金額
  useEffect(() => {
    if (open) {
      const initialStr = currentBalance.toString();
      setNewBalanceStr(initialStr);
    }
  }, [open, currentBalance]);

  const parsedNewBalance = parseFloat(newBalanceStr) || 0;
  const balanceDiff = Math.round((parsedNewBalance - currentBalance) * 100) / 100;

  const handleConfirm = async () => {
    if (!accountId || balanceDiff === 0 || !newBalanceStr.trim()) {
      onOpenChange(false);
      return;
    }

    const diffType = balanceDiff > 0 ? 'income' : 'expense';
    const catName = t('accounts.balanceAdjustment');

    const category = await getOrCreateSystemBalanceAdjustmentCategory(diffType, catName);
    if (category) {
      await addTransaction({
        amount: Math.abs(balanceDiff),
        originalAmount: Math.abs(balanceDiff),
        originalCurrency: currency,
        exchangeRate: 1,
        type: diffType,
        category: category.id,
        accountId: accountId,
        date: getLocalDateString(),
        note: '',
      });
      onSuccess?.();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] sm:max-w-[340px] p-4 flex flex-col gap-4 shadow-none rounded-lg border border-border bg-card text-card-foreground select-none">
        {/* Header: 對齊全站標準尺寸與左側主題圖示 */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="size-5 text-primary" />
            <span>{t('accounts.adjustBalance')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-1 space-y-3">
          {/* 表單一：現時金額（不可點擊和輸入） + 新金額（可輸入） */}
          <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
            {/* 現時金額（不可點擊和輸入，以淡色呈現） */}
            <div className="p-3 flex items-center justify-between select-none">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                {t('accounts.currentAmount')}
              </span>
              <span className="text-sm font-mono text-muted-foreground font-medium">
                <AmountDisplay amount={currentBalance} baseCurrency={currency} type="neutral" className="text-muted-foreground" />
              </span>
            </div>

            {/* 新金額（選中色高亮：淺色模式下為黑色，深色模式下為白色） */}
            <div
              onClick={() => adjustInputRef.current?.focus()}
              className="p-3 flex items-center justify-between cursor-text bg-foreground text-background transition-colors"
            >
              <span className="text-xs font-medium text-background/80 uppercase tracking-widest select-none">
                {t('accounts.newAmount')}
              </span>
              <AmountInput
                ref={adjustInputRef}
                value={newBalanceStr}
                onValueChange={setNewBalanceStr}
                allowNegative
                unstyled
                className="text-right font-mono text-sm font-semibold bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-background caret-background p-0 w-36 placeholder:text-background/40"
                placeholder="0.00"
                onSubmitAmount={() => balanceDiff !== 0 && handleConfirm()}
              />
            </div>
          </div>

          {/* 表單二：差額（獨立一個表單，不可點擊和輸入） */}
          <div className="rounded-lg border border-border bg-card overflow-hidden select-none">
            <div className="p-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                {t('accounts.difference')}
              </span>
              <div className="flex items-center font-mono">
                {balanceDiff === 0 ? (
                  <span className="text-sm text-muted-foreground font-medium">
                    {t('accounts.noDifference')}
                  </span>
                ) : (
                  <AmountDisplay
                    amount={balanceDiff}
                    baseCurrency={currency}
                    type={balanceDiff > 0 ? 'income' : 'expense'}
                    showSign={true}
                    className={cn('text-sm font-medium', balanceDiff < 0 && 'text-destructive')}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作按鈕：水平兩端對齊 */}
        <DialogFooter className="flex flex-row items-center justify-between gap-3 sm:gap-3 pt-1">
          <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={balanceDiff === 0 || !newBalanceStr.trim()}
            className="cursor-pointer"
          >
            {t('accounts.confirmAdjust')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
