import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';

export default function CategoryDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allCategories } = useCategories();
  const { transactions } = useTransactions();

  if (!id) return <Navigate to="/settings/categories" />;

  if (!allCategories || !transactions) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading', '載入中...')}</div>;
  }

  const category = allCategories.find(c => c.id === id);
  if (!category) return <Navigate to="/settings/categories" />;

  const categoryTransactions = transactions
    ?.filter(t => !t.deleted && t.category === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <div className="flex items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">{category.name}</h2>
      </div>

      <GroupedTransactionList
        transactions={categoryTransactions}
        contextCategoryId={id}
        title={
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('dashboard.recentTransactions')}
            </h3>
            <span className="text-xs font-mono text-muted-foreground">
              {t('reimbursements.items', { count: categoryTransactions.length })}
            </span>
          </div>
        }
      />
    </div>
  );
}
