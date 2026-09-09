import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { cn } from '@/lib/utils';
import { useLedgers } from '@/hooks/useLedgers';

export default function CategoryDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allCategories } = useCategories();
  const { transactions } = useTransactions();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  if (!id) return <Navigate to="/settings/categories" />;

  if (!allCategories || !transactions) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading', '載入中...')}</div>;
  }

  const category = allCategories.find(c => c.id === id);
  if (!category) return <Navigate to="/settings/categories" />;

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const categoryTransactions = transactions
    ?.filter(t => !t.deleted && t.category === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

  return (
    <div className="animate-in fade-in duration-500 w-full pb-20 p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">{category.name}</h2>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-4 border-b border-border bg-muted/20">
          <h3 className="text-sm font-medium">{t('dashboard.recentTransactions')}</h3>
        </div>
        <div className="divide-y divide-border">
          {categoryTransactions.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noActivity')}
            </div>
          )}
          {categoryTransactions.map(tx => (
            <button 
              key={tx.id} 
              onClick={() => setSelectedTransactionId(tx.id)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">{category.name}</span>
                {tx.note && (
                  <p className="text-sm text-muted-foreground truncate">
                    {tx.note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <AmountDisplay 
                  amount={tx.amount} 
                  originalCurrency={tx.originalCurrency} 
                  baseCurrency={activeLedger?.baseCurrency} 
                  type={tx.type as any} 
                  className={cn("text-base", 
                    tx.type === 'income' ? 'text-primary' : 
                    tx.type === 'expense' ? 'text-muted-foreground' : undefined
                  )}
                  showSign={true}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedTransactionId && (
        <TransactionDetailsDialog 
          transactionId={selectedTransactionId}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}
    </div>
  );
}
