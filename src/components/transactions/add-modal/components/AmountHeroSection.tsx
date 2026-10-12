import { useTranslation } from 'react-i18next';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { formatDisplayAmount } from '@/lib/utils';
import type { Account } from '@/services/db/db';

interface AmountHeroSectionProps {
  selectedAccountId?: string;
  accounts?: Account[];
  selectedCurrency: string;
  displayAmount: string;
  isTyping: boolean;
  amountError?: string;
  accountError?: string;
  onOpenAccountSelect: () => void;
}

export function AmountHeroSection({
  selectedAccountId,
  accounts,
  selectedCurrency,
  displayAmount,
  isTyping,
  amountError,
  accountError,
  onOpenAccountSelect,
}: AmountHeroSectionProps) {
  const { t } = useTranslation();

  const currentAccountName = selectedAccountId
    ? accounts?.find((a) => a.id === selectedAccountId)?.name
    : t('add.account');

  return (
    <>
      {/* 帳戶膠囊徽標 */}
      <div className="mb-2 sm:mb-1.5 flex justify-center">
        <button
          type="button"
          onClick={onOpenAccountSelect}
          className="h-8.5 sm:h-7 px-3.5 sm:px-3 py-0 rounded-full bg-muted/80 border border-border text-sm sm:text-xs text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center gap-2 sm:gap-1.5 w-auto shadow-none"
        >
          <span className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>{currentAccountName}</span>
        </button>
      </div>

      {/* 無邊界超大等寬字體金額展示 (Massive Monospace Amount Display with Safe AutoMarquee) */}
      <div className="w-full max-w-full overflow-hidden px-4 py-1">
        <AutoMarquee align="center" isTyping={isTyping} className="max-w-full">
          <div className="inline-flex items-baseline justify-center gap-1.5 whitespace-nowrap">
            <span className="text-xl font-medium text-muted-foreground tracking-tight shrink-0">
              {selectedCurrency}
            </span>
            <span className="text-5xl font-mono font-bold tracking-tighter text-foreground select-text shrink-0">
              {formatDisplayAmount(displayAmount)}
            </span>
          </div>
        </AutoMarquee>
      </div>

      {amountError && <p className="text-xs font-medium text-destructive mt-1">{amountError}</p>}
      {accountError && <p className="text-xs font-medium text-destructive mt-1">{accountError}</p>}
    </>
  );
}
