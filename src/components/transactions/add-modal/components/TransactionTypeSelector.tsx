import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import type { TransactionType, LoanType } from '../types';

interface TransactionTypeSelectorProps {
  type: TransactionType;
  loanType: LoanType;
  walletCount: number;
  onTypeChange: (newType: TransactionType, newLoanType?: LoanType) => void;
  onClose: () => void;
}

const TYPE_KEYS = ['expense', 'income', 'transfer', 'lend', 'borrow'] as const;

export function TransactionTypeSelector({
  type,
  loanType,
  walletCount,
  onTypeChange,
  onClose,
}: TransactionTypeSelectorProps) {
  const { t } = useTranslation();

  const activeTypeKey = type === 'loan' ? (loanType === 'lend' ? 'lend' : 'borrow') : type;
  const activeTypeIndex = TYPE_KEYS.indexOf(activeTypeKey);

  return (
    <div className="sticky top-0 z-20 w-full flex items-center justify-between gap-2 shrink-0 bg-background/95 sm:bg-card/95 backdrop-blur-md py-1 -mt-1">
      <div className="relative h-10 sm:h-9 flex-1 bg-muted/80 border border-border p-0.5 rounded-full flex items-center justify-between text-sm sm:text-xs font-medium select-none overflow-hidden">
        {/* 滑動式膠囊指示器 (Sliding Segmented Indicator) */}
        <div
          className="absolute inset-y-0.5 rounded-full bg-primary pointer-events-none z-0 shadow-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: '2px',
            width: 'calc((100% - 4px) / 5)',
            transform: `translate3d(${activeTypeIndex * 100}%, 0, 0)`,
          }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => onTypeChange('expense')}
          className={cn(
            "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
            activeTypeKey === 'expense' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('add.expense')}
        </button>

        <button
          type="button"
          onClick={() => onTypeChange('income')}
          className={cn(
            "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
            activeTypeKey === 'income' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('add.income')}
        </button>

        <button
          type="button"
          onClick={() => {
            if (walletCount < 2) {
              toast.show(t('alerts.transferNeedsTwoAccounts'));
              return;
            }
            onTypeChange('transfer');
          }}
          className={cn(
            "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
            walletCount < 2 && activeTypeKey !== 'transfer' && "opacity-40 cursor-not-allowed",
            activeTypeKey === 'transfer' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('add.transfer')}
        </button>

        <button
          type="button"
          onClick={() => onTypeChange('loan', 'lend')}
          className={cn(
            "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
            activeTypeKey === 'lend' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('add.lend')}
        </button>

        <button
          type="button"
          onClick={() => onTypeChange('loan', 'borrow')}
          className={cn(
            "relative z-10 h-full flex-1 rounded-full flex items-center justify-center text-center transition-colors cursor-pointer",
            activeTypeKey === 'borrow' ? "text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t('add.borrow')}
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-10 h-10 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
        aria-label="Close"
      >
        <X className="w-4.5 h-4.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
}
