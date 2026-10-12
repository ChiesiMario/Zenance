import { useTranslation } from 'react-i18next';
import { Gift, ArrowRightLeft, ArrowRight } from 'lucide-react';
import { cn, formatDisplayAmount, formatAmountNumber } from '@/lib/utils';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import type { Account, Contact } from '@/services/db/db';
import type { LoanType, KeypadFocusedField } from '../types';

interface LoanDualCardsProps {
  loanType: LoanType;
  focusedField: KeypadFocusedField;
  setFocusedField: React.Dispatch<React.SetStateAction<KeypadFocusedField>>;
  isCrossCurrency: boolean;
  fromCurrency: string;
  toCurrency: string;
  displayAmount: string;
  displayAmountIn: string;
  parsedAmount: number;
  parsedAmountIn: number;
  calculatedRate: number | null;
  isGift: boolean;
  isTyping: boolean;
  selectedFromAccountId?: string;
  selectedToAccountId?: string;
  accounts?: Account[];
  loanContact: Contact | null;
  amountError?: string;
  fromAccountError?: string;
  toAccountError?: string;
  onOpenFromAccountSelect: () => void;
  onOpenToAccountSelect: () => void;
  onToggleLoanType: () => void;
}

export function LoanDualCards({
  loanType,
  focusedField,
  setFocusedField,
  isCrossCurrency,
  fromCurrency,
  toCurrency,
  displayAmount,
  displayAmountIn,
  parsedAmount,
  parsedAmountIn,
  calculatedRate,
  isGift,
  isTyping,
  selectedFromAccountId,
  selectedToAccountId,
  accounts,
  loanContact,
  amountError,
  fromAccountError,
  toAccountError,
  onOpenFromAccountSelect,
  onOpenToAccountSelect,
  onToggleLoanType,
}: LoanDualCardsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 借貸大金額展示（可點擊在出款/到款之間切換焦點） */}
      <div className="w-full max-w-full overflow-hidden px-4 py-1">
        <button
          type="button"
          onClick={() => {
            if (isCrossCurrency) {
              setFocusedField((prev) => (prev === 'in' ? 'out' : 'in'));
            } else {
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
              ? focusedField === 'in'
                ? t('add.inflow', '到款')
                : t('add.outflow', '出款')
              : t('add.loanAmount', '借貸金額')
          }
        >
          <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
            <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
              <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">
                {isCrossCurrency && focusedField === 'in' ? toCurrency : fromCurrency}
              </span>
              <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
                {formatDisplayAmount(
                  isCrossCurrency && focusedField === 'in' ? displayAmountIn : displayAmount
                )}
              </span>
            </div>
          </AutoMarquee>
        </button>
      </div>

      {/* 借貸資訊列：贈與標籤與匯率折算膠囊 */}
      <div className="h-8 sm:h-7 flex items-center justify-center gap-2 my-1">
        {isGift && (
          <div className="h-8 sm:h-7 px-3 sm:px-2.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-xs sm:text-[11px] font-medium inline-flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150 select-none shrink-0">
            <Gift className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-purple-500 shrink-0" />
            <span>{t('add.gift', '贈與')}</span>
          </div>
        )}

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

      {/* 獨立借貸卡片與置中方向切換按鈕 */}
      <div className="relative w-full flex items-stretch gap-2 mt-6 sm:mt-7 mb-1 overflow-visible">
        {/* 左卡片：出款方 (Lend 為我的錢包，Borrow 為聯絡人) */}
        <div className="relative flex-1 min-w-0 overflow-visible">
          {/* 左側頭像懸浮徽標 */}
          <div className="absolute top-0 -translate-y-1/2 right-3 sm:right-4 z-20 pointer-events-none">
            {loanType === 'lend' ? (
              <div
                className="w-9 h-9 rounded-full bg-foreground text-background border border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                title={t('add.me')}
              >
                {t('add.me')}
              </div>
            ) : loanContact ? (
              <ContactAvatar
                group={loanContact.group}
                className="w-9 h-9 bg-card"
                iconClassName="w-4 h-4 text-muted-foreground"
                title={loanContact.name}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-card text-muted-foreground/40 border border-dashed border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                title={t('add.contact')}
              >
                ?
              </div>
            )}
          </div>

          {isCrossCurrency && parsedAmount > 0 && (
            <div className="absolute -top-3.5 left-0 sm:-left-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                  {t('add.outflow', '出款')}
                </span>
                <span className="text-xs font-mono font-bold whitespace-nowrap">
                  {fromCurrency} {formatAmountNumber(parsedAmount)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenFromAccountSelect}
            className={cn(
              "w-full h-full min-h-[76px] rounded-2xl border p-3.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
              loanType === 'lend'
                ? selectedFromAccountId && accounts?.some((a) => a.id === selectedFromAccountId)
                : loanContact
                ? "bg-card border-border hover:bg-muted/30"
                : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="w-full flex items-center justify-start gap-1 mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {loanType === 'lend' ? t('add.lendFrom', '出款') : t('add.borrowFrom', '出款')}
              </span>
            </div>
            <div className="w-full min-w-0 pr-3">
              <span className="text-lg font-bold text-foreground truncate block leading-tight">
                {loanType === 'lend'
                  ? accounts?.find((a) => a.id === selectedFromAccountId)?.name || '\u00A0'
                  : loanContact?.name || '\u00A0'}
              </span>
            </div>
          </button>
        </div>

        {/* 置中切換方向按鈕 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLoanType();
            }}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-card hover:bg-muted border border-border flex items-center justify-center text-foreground transition-all active:scale-90 cursor-pointer shadow-none"
            title={loanType === 'lend' ? t('add.lend') : t('add.borrow')}
          >
            <ArrowRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>

        {/* 右卡片：入款方 (Lend 為聯絡人，Borrow 為我的錢包) */}
        <div className="relative flex-1 min-w-0 overflow-visible">
          {/* 右側頭像懸浮徽標 */}
          <div className="absolute top-0 -translate-y-1/2 left-3 sm:left-4 z-20 pointer-events-none">
            {loanType === 'lend' ? (
              loanContact ? (
                <ContactAvatar
                  group={loanContact.group}
                  className="w-9 h-9 bg-card"
                  iconClassName="w-4 h-4 text-muted-foreground"
                  title={loanContact.name}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full bg-card text-muted-foreground/40 border border-dashed border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                  title={t('add.contact')}
                >
                  ?
                </div>
              )
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-foreground text-background border border-border flex items-center justify-center text-sm font-semibold select-none shadow-none"
                title={t('add.me')}
              >
                {t('add.me')}
              </div>
            )}
          </div>

          {isCrossCurrency && parsedAmountIn > 0 && (
            <div className="absolute -top-3.5 right-0 sm:-right-4 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white text-xs font-mono font-bold shadow-none">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-sans font-normal shrink-0">
                  {t('add.inflow', '到款')}
                </span>
                <span className="text-xs font-mono font-bold whitespace-nowrap">
                  {toCurrency} {formatAmountNumber(parsedAmountIn)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenToAccountSelect}
            className={cn(
              "w-full h-full min-h-[76px] rounded-2xl border p-3.5 flex flex-col justify-between items-end text-right cursor-pointer transition-all shadow-none focus-visible:ring-1 focus-visible:ring-foreground",
              loanType === 'lend'
                ? loanContact
                : selectedToAccountId && accounts?.some((a) => a.id === selectedToAccountId)
                ? "bg-card border-border hover:bg-muted/30"
                : "bg-muted/20 border-dashed border-border/80 hover:bg-muted/40 hover:border-border"
            )}
          >
            <div className="w-full flex items-center justify-end gap-1 mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {loanType === 'lend' ? t('add.lendTo', '入款') : t('add.borrowTo', '入款')}
              </span>
            </div>
            <div className="w-full min-w-0 pl-3">
              <span className="text-lg font-bold text-foreground truncate block leading-tight text-right">
                {loanType === 'lend'
                  ? loanContact?.name || '\u00A0'
                  : accounts?.find((a) => a.id === selectedToAccountId)?.name || '\u00A0'}
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
