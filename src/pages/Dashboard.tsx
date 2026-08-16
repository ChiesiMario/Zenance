import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Trash2, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { transactions, deleteTransaction } = useTransactions();
  const { categories } = useCategories();
  const { t } = useTranslation();

  const { income, expense, balance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    if (transactions) {
      transactions.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;
      });
    }
    return { income: inc, expense: exp, balance: inc - exp };
  }, [transactions]);

  const getCategoryName = (id: string) => {
    return categories?.find(c => c.id === id)?.name || id;
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t('dashboard.overview')}</h2>
        <Link to="/settings" className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="size-5" strokeWidth={1.5} />
        </Link>
      </div>
      
      {/* Vercel Usage Dashboard Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        
        {/* Top Summary row */}
        <div className="p-6 border-b border-border flex flex-col items-start justify-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('dashboard.netBalance')}</p>
          <div className="text-5xl font-mono tracking-tighter font-medium">
            ${balance.toLocaleString()}
          </div>
        </div>

        {/* Split Metrics */}
        <div className="grid grid-cols-2 border-b border-border">
          <div className="p-5 border-r border-border flex flex-col">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.income')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium">${income.toLocaleString()}</p>
          </div>
          <div className="p-5 flex flex-col">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.expense')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium">${expense.toLocaleString()}</p>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div>
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="text-sm font-medium">{t('dashboard.activity')}</h3>
          </div>
          
          <div className="divide-y divide-border">
            {(!transactions || transactions.length === 0) && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t('dashboard.noActivity')}
              </div>
            )}
            
            {transactions?.slice(0, 15).map((t) => (
              <div key={t.id} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">{getCategoryName(t.category)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.date} {t.note && `· ${t.note}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-mono font-medium ${t.type === 'income' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {t.type === 'expense' ? '-' : '+'}${t.amount.toLocaleString()}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteTransaction(t.id)} 
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
