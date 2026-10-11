import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
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

export default function TagDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allTags } = useTags();
  const { transactions } = useTransactions();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const { getRate } = useExchangeRates();

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  if (!id) return <Navigate to="/settings/tags" />;

  if (!allTags || !transactions) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading', '載入中...')}</div>;
  }

  const tag = allTags.find(t => t.id === id);
  if (!tag) return <Navigate to="/settings/tags" />;

  const tagTransactions = sortTransactionsDesc(
    transactions?.filter(t => !t.deleted && t.tagIds?.includes(id)) || []
  );

  const { allTimeAmount, pastMonthAmount, pastYearAmount } = useMemo(() => {
    if (!tagTransactions || !tag) {
      return { allTimeAmount: undefined, pastMonthAmount: undefined, pastYearAmount: undefined };
    }

    const now = new Date();
    const oneMonthAgoStr = format(subDays(now, 30), 'yyyy-MM-dd');
    const oneYearAgoStr = format(subYears(now, 1), 'yyyy-MM-dd');

    let allSum = 0;
    let monthSum = 0;
    let yearSum = 0;

    tagTransactions.forEach(tx => {
      const converted = tx.originalCurrency
        ? convertAmount(tx.originalAmount, tx.originalCurrency, baseCurrency, getRate)
        : tx.amount;
      let delta = converted;
      if (tx.parentId) {
        delta = -converted;
      } else if (tx.type === 'income') {
        delta = -converted;
      }

      allSum += delta;
      if (tx.date >= oneMonthAgoStr) {
        monthSum += delta;
      }
      if (tx.date >= oneYearAgoStr) {
        yearSum += delta;
      }
    });

    return {
      allTimeAmount: Math.round(Math.abs(allSum) * 100) / 100,
      pastMonthAmount: Math.round(Math.abs(monthSum) * 100) / 100,
      pastYearAmount: Math.round(Math.abs(yearSum) * 100) / 100,
    };
  }, [tagTransactions, tag, baseCurrency, getRate]);

  return (
    <div className="w-full space-y-4 pb-20">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">#{tag.name}</h2>
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
              <MagnitudeBadge amount={allTimeAmount} memoryKey={`tag-all-${id}`} />
            </div>
          </div>
          <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-4 leading-none">
            <AmountDisplay 
              amount={allTimeAmount} 
              baseCurrency={baseCurrency} 
              type="neutral" 
              showSign={false}
              memoryKey={`tag-all-${id}`}
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
              <MagnitudeBadge amount={pastMonthAmount} memoryKey={`tag-month-${id}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={pastMonthAmount} 
                  baseCurrency={baseCurrency} 
                  type="neutral" 
                  showSign={false}
                  memoryKey={`tag-month-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">
                {t('stats.pastYear', '近一年')}
              </p>
              <MagnitudeBadge amount={pastYearAmount} memoryKey={`tag-year-${id}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={pastYearAmount} 
                  baseCurrency={baseCurrency} 
                  type="neutral" 
                  showSign={false}
                  memoryKey={`tag-year-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
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
