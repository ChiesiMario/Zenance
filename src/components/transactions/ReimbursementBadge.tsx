import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';

export interface ReimbursementBadgeProps {
  transaction?: Pick<Transaction, 'reimbursementStatus'> | null;
  status?: 'pending' | 'reimbursed' | 'partial' | 'none';
  className?: string;
  // 保持向前相容參數（若外部傳入也不會出錯）
  contactId?: string;
  showContactName?: boolean;
}

export function ReimbursementBadge({
  transaction,
  status,
  className,
}: ReimbursementBadgeProps) {
  const { t } = useTranslation();

  const currentStatus = status || transaction?.reimbursementStatus;

  if (!currentStatus || currentStatus === 'none') {
    return null;
  }

  const isPending = currentStatus === 'pending';
  const isPartial = currentStatus === 'partial';
  const isSettled = currentStatus === 'reimbursed';

  if (!isPending && !isPartial && !isSettled) {
    return null;
  }

  const text = isSettled
    ? t('reimbursements.statusSettled', '已收款')
    : isPartial
    ? t('reimbursements.statusPartial', '部分收款')
    : t('reimbursements.statusPending', '代付');

  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded leading-none border shrink-0 font-medium",
        isPending
          ? "bg-muted text-foreground border-border"
          : "bg-muted/40 text-muted-foreground/60 border-border/50",
        className
      )}
    >
      {text}
    </span>
  );
}
