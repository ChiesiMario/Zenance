import { useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Home, Plus, Wallet, PieChart, Users, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, HandCoins } from 'lucide-react';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useAccounts } from '@/hooks/useAccounts';
import { toast, Toaster } from '@/components/ui/toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { AddTransactionModal } from '@/components/transactions/AddTransactionModal';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useExchangeRates(); // Trigger background sync
  
  const { transactions } = useTransactions();
  const { ledgers } = useLedgers();
  const { wallets } = useAccounts();
  const { activeLedgerId, editingTransactionId, setEditingTransactionId, viewingTransactionId, setViewingTransactionId, isAddModalOpen, addModalType, addModalLoanType, addModalContactId, openAddModal, closeAddModal } = useAppStore();
  
  const walletCount = wallets?.length ?? 0;
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');
  
  const stats = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let expense = 0;
    let income = 0;
    let transfer = 0;
    let loan = 0;
    
    transactions?.filter(t => t.date.startsWith(prefix)).forEach(t => {
      if (t.type === 'expense') expense += t.amount;
      else if (t.type === 'income') income += t.amount;
      else if (t.type === 'transfer') transfer += t.amount;
      else if (t.type === 'loan') loan += t.amount;
    });
    
    const format = (val: number) => {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(val);
    };
    
    return {
      expense: format(expense),
      income: format(income),
      transfer: format(transfer),
      loan: format(loan)
    };
  }, [transactions]);
  
  const handleOpenAddModal = (type: 'expense' | 'income' | 'transfer' | 'loan', loanType?: 'borrow' | 'lend') => {
    openAddModal(type, loanType);
  };

  const navItems = [
    { path: '/', label: t('nav.overview'), icon: Home },
    { path: '/budgets', label: t('nav.budgets'), icon: PieChart },
    { path: '/add', label: t('nav.add'), icon: Plus },
    { path: '/accounts', label: t('nav.accounts'), icon: Wallet },
    { path: '/contacts', label: t('nav.contacts'), icon: Users },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background text-foreground w-full relative selection:bg-primary selection:text-primary-foreground">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto overflow-y-auto pb-24 px-5 pt-4 [scrollbar-gutter:stable]">
        <Outlet />
      </main>

      {/* Bottom Navigation - Frosted Glass */}
      <nav className="fixed bottom-0 w-full bg-background/80 backdrop-blur-xl border-t border-border flex justify-around items-center h-16 pb-safe z-50">
        <div className="w-full max-w-xl mx-auto flex justify-around items-center h-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            if (item.path === '/add') {
              if (walletCount === 0) {
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => toast.show(t('alerts.noAccounts'))}
                    className="flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 opacity-40 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={t('nav.add')}
                  >
                    <Icon className="size-6 transition-transform duration-300" strokeWidth={1.5} />
                  </button>
                );
              }

              return (
                <DropdownMenu key={item.path}>
                  <DropdownMenuTrigger
                    className="flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 text-muted-foreground hover:text-foreground"
                  >
                    <Icon className="size-6 transition-transform duration-300" strokeWidth={1.5} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="mb-4 w-max bg-card text-card-foreground border border-border ring-0 shadow-none rounded-lg p-1.5">
                    <div className="flex flex-row items-center gap-1">
                      <DropdownMenuItem onClick={() => handleOpenAddModal('expense')} className="flex flex-col items-center justify-center p-2 w-16 gap-1 cursor-pointer rounded-md">
                        <ArrowUpRight className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                        <span className="text-[11px] font-medium">{t('add.expense')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.expense}</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem onClick={() => handleOpenAddModal('income')} className="flex flex-col items-center justify-center p-2 w-16 gap-1 cursor-pointer rounded-md">
                        <ArrowDownLeft className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                        <span className="text-[11px] font-medium">{t('add.income')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.income}</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => {
                          if (walletCount < 2) {
                            toast.show(t('alerts.transferNeedsTwoAccounts'));
                            return;
                          }
                          handleOpenAddModal('transfer');
                        }} 
                        className={cn(
                          "flex flex-col items-center justify-center p-2 w-16 gap-1 rounded-md",
                          walletCount < 2 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        <ArrowRightLeft className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                        <span className="text-[11px] font-medium">{t('add.transfer')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.transfer}</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex flex-col items-center justify-center p-2 w-16 gap-1 cursor-pointer rounded-md [&>svg:last-child]:hidden outline-none data-[state=open]:bg-accent/50 focus:bg-accent/50 text-muted-foreground focus:text-foreground">
                          <HandCoins className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                          <span className="text-[11px] font-medium text-foreground">{t('add.loan')}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.loan}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent sideOffset={8} className="min-w-[120px]">
                            <DropdownMenuItem onClick={() => handleOpenAddModal('loan', 'lend')} className="cursor-pointer">
                              {t('add.lend')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenAddModal('loan', 'borrow')} className="cursor-pointer">
                              {t('add.borrow')}
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 outline-none",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-6 transition-transform duration-300", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 1.5} />
              </button>
            );
          })}
        </div>
      </nav>
      
      <AddTransactionModal 
        isOpen={isAddModalOpen || !!editingTransactionId} 
        onClose={() => {
          closeAddModal();
          if (editingTransactionId) setEditingTransactionId(null);
        }} 
        initialType={addModalType}
        initialLoanType={addModalLoanType}
        transactionToEditId={editingTransactionId}
        initialContactId={addModalContactId}
      />

      <TransactionDetailsDialog 
        transactionId={viewingTransactionId} 
        onClose={() => setViewingTransactionId(null)} 
      />

      <Toaster />
    </div>
  );
}
