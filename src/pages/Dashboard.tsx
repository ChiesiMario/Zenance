import { useCategories } from '@/hooks/useCategories';
import { useBudgets } from '@/hooks/useBudgets';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Settings, ChevronDown, ChevronLeft, ChevronRight, Plus, BarChart3, Check } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { MagnitudeBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManageLedgersDialog, CreateLedgerDialog } from '@/components/ledgers/ManageLedgersDialog';
import { useNavigate, Link } from 'react-router-dom';
import { BudgetProgressBar } from '@/components/budgets/BudgetProgressBar';
import { useMonthTransactions } from '@/hooks/useMonthTransactions';
import { SyncStatusPill } from '@/components/sync/SyncStatusPill';

export default function Dashboard() {
  const navigate = useNavigate();
  const { allCategories } = useCategories();
  const { getActiveBudgetsForMonth } = useBudgets();
  const { ledgers } = useLedgers();
  const { activeLedgerId, setActiveLedgerId } = useAppStore();
  const { t, i18n } = useTranslation();

  const [isManageLedgersOpen, setIsManageLedgersOpen] = useState(false);
  const [isCreateLedgerOpen, setIsCreateLedgerOpen] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);

  // Initialize active ledger if null
  useEffect(() => {
    if (!activeLedgerId && ledgers && ledgers.length > 0) {
      // Find default ledger or first ledger
      const defaultLedger = ledgers.find(l => l.isDefault) || ledgers[0];
      setActiveLedgerId(defaultLedger.id);
    }
  }, [ledgers, activeLedgerId, setActiveLedgerId]);

  const currentMonthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  const { transactions: monthTransactions } = useMonthTransactions(currentMonthPrefix);
  const filteredTransactions = monthTransactions || [];

  const currentMonthBudgets = useMemo(() => {
    const today = new Date();
    const isCurrentMonth =
      currentMonth.getFullYear() === today.getFullYear() &&
      currentMonth.getMonth() === today.getMonth();
    return getActiveBudgetsForMonth(currentMonth, isCurrentMonth ? 3 : 6);
  }, [getActiveBudgetsForMonth, currentMonth]);

  const isBalanceAdjustment = (tx: any) => {
    if (tx.type !== 'income' && tx.type !== 'expense') return false;
    // 退款交易（具有 parentId）不視為常規餘額調整，參與沖抵計算
    if (tx.parentId) return false;
    const cat = allCategories?.find(c => c.id === tx.category);
    return !!cat?.isSystem;
  };

  const { income, expense, balance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach(t => {
      if (isBalanceAdjustment(t)) return;

      // 退款交易沖抵邏輯：
      // 1. 支出退款（type === 'income' 且有 parentId）：直接扣除支出統計，不計入收入
      // 2. 收入退款（type === 'expense' 且有 parentId）：直接扣除收入統計，不計入支出
      if (t.parentId) {
        if (t.type === 'income') {
          exp -= t.amount;
        } else if (t.type === 'expense') {
          inc -= t.amount;
        }
        return;
      }

      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    });
    return { income: inc, expense: exp, balance: inc - exp };
  }, [filteredTransactions, allCategories]);

  const formatMonth = (date: Date) => {
    const isCurrentYear = date.getFullYear() === new Date().getFullYear();
    let str = date.toLocaleDateString(i18n.language, {
      year: isCurrentYear ? undefined : 'numeric',
      month: 'long'
    });
    
    // Apply Pangu spacing for Chinese mixed with numbers
    if (i18n.language.startsWith('zh')) {
      str = str.replace(/([0-9a-zA-Z])([一-龥])/g, '$1 $2').replace(/([一-龥])([0-9a-zA-Z])/g, '$1 $2');
    }
    
    return str;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };


  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4 mb-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center text-xl font-semibold tracking-tight hover:bg-muted/50 data-[state=open]:bg-muted/50 rounded-md px-2 -ml-2 py-1 outline-none min-w-0 max-w-[250px]">
            <span className="truncate">
              {activeLedger?.name || t('dashboard.overview')}
            </span>
            <ChevronDown className="ml-1 h-4 w-4 opacity-50 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuGroup>
              {ledgers?.map(ledger => {
                const isActive = ledger.id === activeLedgerId;
                return (
                  <DropdownMenuItem 
                    key={ledger.id}
                    onClick={() => setActiveLedgerId(ledger.id)}
                    className="justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 mr-1.5">
                      <span className={cn("truncate block", isActive && "font-medium text-foreground")}>
                        {ledger.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {ledger.baseCurrency || 'CNY'}
                      </span>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-foreground shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="-mx-1 my-1" />
            <DropdownMenuItem onClick={() => setIsCreateLedgerOpen(true)} className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{t('dashboard.createLedger')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsManageLedgersOpen(true)} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{t('dashboard.manageLedgers')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ManageLedgersDialog
          open={isManageLedgersOpen}
          onOpenChange={setIsManageLedgersOpen}
        />

        <CreateLedgerDialog
          open={isCreateLedgerOpen}
          onOpenChange={setIsCreateLedgerOpen}
        />

        <div className="flex items-center gap-1.5 -mr-2 shrink-0">
          <SyncStatusPill />
          <Link 
            to="/reports" 
            title={t('reports.title')}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <BarChart3 className="size-5" strokeWidth={1.5} />
          </Link>
          <Link 
            to="/settings" 
            title={t('settings.settings')}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Settings className="size-5" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Top Overview Container */}
        <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        
        {/* Month Selector */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
          <Button variant="ghost" onClick={handlePrevMonth} className="!size-8 !p-0 text-muted-foreground hover:text-foreground rounded-md">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm capitalize">{formatMonth(currentMonth)}</span>
          <Button variant="ghost" onClick={handleNextMonth} className="!size-8 !p-0 text-muted-foreground hover:text-foreground rounded-md">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Top Summary row */}
        <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center h-5 mb-2 w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('dashboard.netBalance')}</p>
            <div className="absolute right-0 flex items-center">
              <MagnitudeBadge amount={balance} memoryKey={`dashboard-net-balance-${currentMonthPrefix}`} />
            </div>
          </div>
          <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-2 leading-none">
            <AmountDisplay 
              amount={balance} 
              baseCurrency={activeLedger?.baseCurrency} 
              type="balance" 
              animated 
              memoryKey={`dashboard-net-balance-${currentMonthPrefix}`}
            />
          </AutoMarquee>
        </div>

        {/* Split Metrics */}
        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('dashboard.income')}</p>
              <MagnitudeBadge amount={income} memoryKey={`dashboard-income-${currentMonthPrefix}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={income} 
                  baseCurrency={activeLedger?.baseCurrency} 
                  type="income" 
                  animated 
                  memoryKey={`dashboard-income-${currentMonthPrefix}`}
                />
              </AutoMarquee>
            </div>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('dashboard.expense')}</p>
              <MagnitudeBadge amount={expense} memoryKey={`dashboard-expense-${currentMonthPrefix}`} />
            </div>
            <div className="text-2xl font-mono tracking-tight font-medium leading-none">
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={expense} 
                  baseCurrency={activeLedger?.baseCurrency} 
                  type="expense" 
                  showSign={false} 
                  animated 
                  memoryKey={`dashboard-expense-${currentMonthPrefix}`}
                />
              </AutoMarquee>
            </div>
          </div>
        </div>

        {/* Integrated Budget Section (up to 3, vertical stack) */}
        {currentMonthBudgets.length > 0 && (
          <div className="border-t border-border divide-y divide-border">
            {currentMonthBudgets.map(({ budget, spent, effectiveAmount }) => {
              const isOver = spent > effectiveAmount;
              const percentage = Math.min(100, (spent / effectiveAmount) * 100);

              return (
                <button
                  key={budget.id}
                  type="button"
                  onClick={() => navigate(`/budgets/${budget.id}`, { state: { period: currentMonthPrefix } })}
                  className="w-full p-4 bg-card text-left hover:bg-muted/10 transition-colors cursor-pointer block group"
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors truncate pr-2 block m-0 leading-none">
                      {budget.name}
                    </span>
                    <div className="text-right shrink-0 flex items-center leading-none">
                      <AmountDisplay 
                        amount={spent} 
                        baseCurrency={activeLedger?.baseCurrency} 
                        type="neutral" 
                        className={cn(
                          "text-xs font-mono font-normal",
                          isOver ? 'text-destructive' : 'text-foreground'
                        )}
                      />
                      <span className="text-xs text-muted-foreground ml-1 font-mono font-normal">
                        / <AmountDisplay amount={effectiveAmount} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
                      </span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <BudgetProgressBar
                    budgetKey={budget.id}
                    percentage={percentage}
                    isOver={isOver}
                    variant="primary"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Transactions List Container */}
      <GroupedTransactionList transactions={filteredTransactions} />
      </div>
    </div>
  );
}
