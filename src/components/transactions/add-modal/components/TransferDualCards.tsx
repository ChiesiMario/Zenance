import { useTranslation } from 'react-i18next';
import { Zap, ArrowRightLeft } from 'lucide-react';
import { cn, formatDisplayAmount, formatAmountNumber } from '@/lib/utils';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import type { Account } from '@/services/db/db';
import type { KeypadFocusedField } from '../types';

interface TransferDualCardsProps {
  focusedField: KeypadFocusedField;
  previousAmountField: 'out' | 'in';
  setFocusedField: (field: KeypadFocusedField) => void;
  setPreviousAmountField: (field: 'out' | 'in') => void;
  isCrossCurrency: boolean;
  fromCurrency: string;
  toCurrency: string;
  displayAmount: string;
  displayAmountIn: string;
  displayFeeAmount: string;
  parsedFeeAmount: number;
  parsedAmount: number;
  parsedAmountIn: number;
  calculatedRate: number | null;
  transferDeductedAmount: number;
  transferReceivedAmount: number;
  showTransferBubbles: boolean;
  isTyping: boolean;
  selectedFromAccountId?: string;
  selectedToAccountId?: string;
  accounts?: Account[];
  amountError?: string;
  fromAccountError?: string;
  toAccountError?: string;
  onOpenFromAccountSelect: () => void;
  onOpenToAccountSelect: () => void;
  onSwapAccounts: () => void;
}

export function TransferDualCards({
  focusedField,
  previousAmountField,
  setFocusedField,
  setPreviousAmountField,
  isCrossCurrency,
  fromCurrency,
  toCurrency,
  displayAmount,
  displayAmountIn,
  displayFeeAmount: _displayFeeAmount,
  parsedFeeAmount,
  parsedAmount,
  parsedAmountIn,
  calculatedRate,
  transferDeductedAmount,
  transferReceivedAmount,
  showTransferBubbles,
  isTyping,
  selectedFromAccountId,
  selectedToAccountId,
  accounts,
  amountError,
  fromAccountError,
  toAccountError,
  onOpenFromAccountSelect,
  onOpenToAccountSelect,
  onSwapAccounts,
}: TransferDualCardsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 轉帳大金額展示（可點擊在出款/到款之間切換焦點） */}
      <div className="w-full max-w-full overflow-hidden px-4 py-1">
        <button
          type="button"
          onClick={() => {
            if (focusedField === 'fee') {
              setFocusedField(previousAmountField);
            } else if (isCrossCurrency) {
              const next = focusedField === 'in' ? 'out' : 'in';
              setPreviousAmountField(next);
              setFocusedField(next);
            } else {
              setPreviousAmountField('out');
              setFocusedField('out');
            }
          }}
          className={cn(
            "w-full flex items-center justify-center py-1 px-2 rounded-2xl transition-all cursor-pointer shadow-none overflow-hidden",
            focusedField === 'out' || focusedField === 'in'
              ? "opacity-100"
              : "opacity-40 hover:opacity-80"
          )}
          title={
            isCrossCurrency
              ? focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in')
                ? t('add.inflow', '到款')
                : t('add.outflow', '出款')
              : t('add.transferAmount', '轉帳')
          }
        >
          <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
            <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
              <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">
                {isCrossCurrency && (focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in'))
                  ? toCurrency
                  : fromCurrency}
              </span>
              <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
                {formatDisplayAmount(
                  isCrossCurrency && (focusedField === 'in' || (focusedField === 'fee' && previousAmountField === 'in'))
                    ? displayAmountIn
                    : displayAmount
                )}
              </span>
            </div>
          </AutoMarquee>
        </button>
      </div>

      {/* 手續費膠囊與跨幣別匯率折算膠囊 */}
      <div className="h-8 sm:h-7 flex items-center justify-center gap-2 my-1">
        <button
          type="button"
          onClick={() => {
            if (focusedField === 'fee') {
              setFocusedField(previousAmountField);
            } else {
              setPreviousAmountField(focusedField === 'in' ? 'in' : 'out');
              setFocusedField('fee');
            }
          }}
          className={cn(
            "h-8 sm:h-7 px-3.5 sm:px-3 rounded-full border text-xs sm:text-[11px] inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-none shrink-0",
            focusedField === 'fee'
              ? "bg-amber-500/15 border-amber-500/70 text-foreground ring-1 ring-amber-500/40 font-semibold"
              : parsedFeeAmount > 0
                ? "bg-muted/80 border-border text-foreground hover:border-foreground/30"
                : "bg-muted/60 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
          )}
        >
          <Zap
            className={cn(
              "w-3.5 h-3.5 sm:w-3 sm:h-3",
              focusedField === 'fee' || parsedFeeAmount > 0 ? "text-amber-500" : "text-muted-foreground"
            )}
          />
          <span>{t('add.fee', '手續費')}：</span>
          <span className="font-mono font-semibold text-foreground">
            {parsedFeeAmount > 0
              ? `${parsedFeeAmount.toLocaleString()} ${fromCurrency}`
              : t('add.noFee', '無手續費')}
          </span>
        </button>

        {isCrossCurrency && (
          <div className="h-8 sm:h-7 px-3 sm:px-2.5 rounded-full border border-border bg-muted/60 text-xs sm:text-[11px] font-mono inline-flex items-center gap-1 shadow-none text-muted-foreground select-none shrink-0">
            <ArrowRightLeft className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-muted-foreground shrink-0" />
            {calculatedRate !== null ? (
              <span>
                1 {fromCurrency} ≈ {parseFloat(calculatedRate.toFixed(4)).toString()} {toCurrency}
              </span>
            ) : parsedAmount > 0 ? (
              <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
            ) : parsedAmountIn > 0 ? (
              <span>
                {t('add.pendingOutflow', '待輸入出款')} ≈ {parsedAmountIn} {toCurrency}
              </span>
            ) : (
              <span>1 {fromCurrency} ≈ {t('add.pendingInflow', '待輸入到款')}</span>
            )}
          </div>
        )}
      </div>

      {amountError && <p className="text-xs font-medium text-destructive mt-1">{amountError}</p>}

      {/* 獨立轉帳卡片與置中對調按鈕 */}
      <div className="relative w-full flex items-stretch gap-2 mt-6 sm:mt-7 mb-1 overflow-visible">
        {/* 左卡片：轉出 (FROM) */}
        <div className="relative flex-1 min-w-0 overflow-visible">
          {showTransferBubbles && (
            <div className="absolute -top-3.5 left-0 sm:-left-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                  {t('add.cardDeducted', '實扣')}
                </span>
                <span className="text-xs font-mono font-bold whitespace-nowrap">
                  {fromCurrency} {formatAmountNumber(transferDeductedAmount)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenFromAccountSelect}
            className={cn(
              "w-full h-full min-h-[76px] rounded-2xl border p-3.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
              selectedFromAccountId && accounts?.some((a) => a.id === selectedFromAccountId)
                ? "bg-card border-border hover:bg-muted/30"
                : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="w-full flex items-center justify-start gap-1 mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('add.transferFrom', '轉出')}
              </span>
            </div>
            <div className="w-full min-w-0 pr-3">
              <span className="text-lg font-bold text-foreground truncate block leading-tight">
                {accounts?.find((a) => a.id === selectedFromAccountId)?.name || '\u00A0'}
              </span>
            </div>
          </button>
        </div>

        {/* 置中對調按鈕 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwapAccounts();
            }}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
            title={t('add.swapAccounts', '對調帳戶')}
          >
            <ArrowRightLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>

        {/* 右卡片：轉入 (TO) */}
        <div className="relative flex-1 min-w-0 overflow-visible">
          {showTransferBubbles && (
            <div className="absolute -top-3.5 right-0 sm:-right-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                  {t('add.cardReceived', '實收')}
                </span>
                <span className="text-xs font-mono font-bold whitespace-nowrap">
                  {toCurrency} {formatAmountNumber(transferReceivedAmount)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenToAccountSelect}
            className={cn(
              "w-full h-full min-h-[76px] rounded-2xl border p-3.5 flex flex-col justify-between items-end text-right cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
              selectedToAccountId && accounts?.some((a) => a.id === selectedToAccountId)
                ? "bg-card border-border hover:bg-muted/30"
                : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="w-full flex items-center justify-end gap-1 mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('add.transferTo', '轉入')}
              </span>
            </div>
            <div className="w-full min-w-0 pl-3">
              <span className="text-lg font-bold text-foreground truncate block leading-tight text-right">
                {accounts?.find((a) => a.id === selectedToAccountId)?.name || '\u00A0'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {(fromAccountError || toAccountError) && (
        <p className="text-xs font-medium text-destructive mt-1">
          {fromAccountError || toAccountError}
        </p>
      )}
    </>
  );
}
