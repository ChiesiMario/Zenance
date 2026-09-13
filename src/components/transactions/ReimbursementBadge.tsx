import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/services/db/db';

export interface ReimbursementBadgeProps {
  transaction?: Pick<Transaction, 'reimbursementStatus'> | null;
  status?: 'pending' | 'reimbursed' | 'none';
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
  const isSettled = currentStatus === 'reimbursed';

  if (!isPending && !isSettled) {
    return null;
  }

  const text = isPending
    ? t('reimbursements.statusPending', '待報銷')
    : t('reimbursements.statusSettled', '已報銷');

  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded leading-none border shrink-0 font-medium",
        isPending
          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
          : "bg-muted text-muted-foreground border-border",
        className
      )}
    >
      {text}
    </span>
  );
}
