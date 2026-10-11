import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { MagnitudeBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { convertAmount } from '@/lib/currency';
import { sortTransactionsDesc } from '@/lib/utils';
import { useMemo } from 'react';
import { subDays, subYears, format } from 'date-fns';

export default function CategoryDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allCategories } = useCategories();
  const { transactions } = useTransactions();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  if (!id) return <Navigate to="/settings/categories" />;

  if (!allCategories || !transactions) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading', '載入中...')}</div>;
  }

  const category = allCategories.find(c => c.id === id);
  if (!category) return <Navigate to="/settings/categories" />;

  const categoryTransactions = sortTransactionsDesc(
    transactions?.filter(t => !t.deleted && t.category === id) || []
  );

  const { pastMonthAmount, pastYearAmount, allTimeAmount } = useMemo(() => {
    if (!categoryTransactions || !category) {
      return { pastMonthAmount: undefined, pastYearAmount: undefined, allTimeAmount: undefined };
    }

    const now = new Date();
    const oneMonthAgoStr = format(subDays(now, 30), 'yyyy-MM-dd');
    const oneYearAgoStr = format(subYears(now, 1), 'yyyy-MM-dd');

    let monthSum = 0;
    let yearSum = 0;
    let allSum = 0;

    categoryTransactions.forEach(tx => {
      const converted = tx.originalCurrency
        ? convertAmount(tx.originalAmount, tx.originalCurrency, baseCurrency, getRate)
        : tx.amount;
      const delta = tx.parentId ? -converted : converted;

      allSum += delta;
      if (tx.date >= oneMonthAgoStr) {
        monthSum += delta;
      }
      if (tx.date >= oneYearAgoStr) {
        yearSum += delta;
      }
    });

    return {
      pastMonthAmount: Math.round(monthSum * 100) / 100,
      pastYearAmount: Math.round(yearSum * 100) / 100,
      allTimeAmount: Math.round(allSum * 100) / 100,
    };
  }, [categoryTransactions, category, baseCurrency, getRate]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight truncate">{category.name}</h2>
        </div>
        <div className="w-8 h-8" />
      </div>

      {/* 1:1 復刻賬戶頁面統計卡片 */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground shadow-none">
        {/* 上半部：全部 */}
        <div className="p-8 border-b border-border flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center h-5 mb-2 w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">
              {t('stats.allTime', '全部')}
            </p>
            <div className="absolute right-0 flex items-center">
              <MagnitudeBadge amount={allTimeAmount} memoryKey={`cat-all-${id}`} />
            </div>
          </div>
          <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-4 leading-none">
            <AmountDisplay 
              amount={allTimeAmount} 
              baseCurrency={baseCurrency} 
              type={category.type === 'income' ? 'income' : 'expense'} 
              showSign={false}
              memoryKey={`cat-all-${id}`}
              className="leading-none"
            />
          </AutoMarquee>
        </div>

        {/* 下半部：近一月 & 近一年 */}
        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">
                {t('stats.pastMonth', '近一月')}
              </p>
              <MagnitudeBadge amount={pastMonthAmount} memoryKey={`cat-month-${id}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={pastMonthAmount} 
                  baseCurrency={baseCurrency} 
                  type={category.type === 'income' ? 'income' : 'expense'} 
                  showSign={false}
                  memoryKey={`cat-month-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">
                {t('stats.pastYear', '近一年')}
              </p>
              <MagnitudeBadge amount={pastYearAmount} memoryKey={`cat-year-${id}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={pastYearAmount} 
                  baseCurrency={baseCurrency} 
                  type={category.type === 'income' ? 'income' : 'expense'} 
                  showSign={false}
                  memoryKey={`cat-year-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
        </div>
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
