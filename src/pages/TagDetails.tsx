import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
import { useTransactions } from '@/hooks/useTransactions';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { sortTransactionsDesc } from '@/lib/utils';

export default function TagDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allTags } = useTags();
  const { transactions } = useTransactions();

  if (!id) return <Navigate to="/settings/tags" />;

  if (!allTags || !transactions) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading', '載入中...')}</div>;
  }

  const tag = allTags.find(t => t.id === id);
  if (!tag) return <Navigate to="/settings/tags" />;

  const tagTransactions = sortTransactionsDesc(
    transactions?.filter(t => !t.deleted && t.tagIds?.includes(id)) || []
  );

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-20">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 px-2 min-w-0">
          <TagIcon className="h-4 w-4 opacity-60 shrink-0" />
          <h2 className="text-xl font-semibold tracking-tight truncate">#{tag.name}</h2>
        </div>
      </div>

      <GroupedTransactionList
        transactions={tagTransactions}
        title={
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('dashboard.recentTransactions')}
            </h3>
            <span className="text-xs font-mono text-muted-foreground">
              {t('tags.items', { count: tagTransactions.length, defaultValue: `${tagTransactions.length} 筆交易` })}
            </span>
          </div>
        }
      />
    </div>
  );
}
