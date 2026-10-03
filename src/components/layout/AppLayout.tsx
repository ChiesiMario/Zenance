import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Home, Plus, Wallet, PieChart, Users, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, HandCoins, Coins } from 'lucide-react';
import Dashboard from '@/pages/Dashboard';
import Budgets from '@/pages/Budgets';
import Accounts from '@/pages/Accounts';
import Contacts from '@/pages/Contacts';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { toast, Toaster } from '@/components/ui/toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddTransactionModal } from '@/components/transactions/AddTransactionModal';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useExchangeRates(); // Trigger background sync
  useDropboxSync(); // Trigger background sync & auto network reconnection pull
  
  const { transactions } = useTransactions();
  const { ledgers } = useLedgers();
  const { wallets, contacts, archivedContacts } = useAccounts();
  const { allCategories } = useCategories();
  const { 
    activeLedgerId, 
    editingTransactionId, 
    setEditingTransactionId, 
    viewingTransactionId, 
    setViewingTransactionId, 
    isAddModalOpen, 
    addModalType, 
    addModalLoanType, 
    addModalContactId, 
    addModalInitialToAccountId,
    addModalInitialAmount,
    addModalInitialAccountId,
    addModalInitialCategoryId,
    addModalInitialNote,
    openAddModal, 
    closeAddModal 
  } = useAppStore();
  
  const walletCount = wallets?.length ?? 0;
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');
  
  const stats = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let expense = 0;
    let income = 0;
    let transfer = 0;
    let lend = 0;
    let borrow = 0;
    
    transactions?.filter(t => t.date.startsWith(prefix) && !t.deleted).forEach(t => {
      // 排除常規餘額調整交易（系統分類），退款子交易具有 parentId 則保留參與沖抵計算
      if (!t.parentId) {
        const cat = allCategories?.find(c => c.id === t.category);
        if (cat?.isSystem) return;
      }

      if (t.parentId) {
        if (t.type === 'income') expense -= t.amount;
        else if (t.type === 'expense') income -= t.amount;
        return;
      }
      if (t.type === 'expense') expense += t.amount;
      else if (t.type === 'income') income += t.amount;
      else if (t.type === 'transfer') transfer += t.amount;
      else if (t.type === 'loan') {
        const isLent = contacts?.some(c => c.id === t.toAccountId) || archivedContacts?.some(c => c.id === t.toAccountId);
        if (isLent) {
          lend += t.amount;
        } else {
          borrow += t.amount;
        }
      }
    });
    
    const format = (val: number) => {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.max(0, val));
    };
    
    return {
      expense: format(expense),
      income: format(income),
      transfer: format(transfer),
      lend: format(lend),
      borrow: format(borrow),
    };
  }, [transactions, contacts, archivedContacts, allCategories]);
  
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

  const TAB_PATHS = ['/', '/budgets', '/accounts', '/contacts'] as const;
  type TabPath = typeof TAB_PATHS[number];
  const isCurrentTab = TAB_PATHS.includes(location.pathname as TabPath);

  // Keep-Alive tab cache: lazy mount when first visited
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => {
    return isCurrentTab ? new Set([location.pathname]) : new Set(['/']);
  });
  const tabLastActiveRef = useRef<Record<string, number>>({
    [location.pathname]: Date.now(),
  });

  // Track each tab/route's scroll position independently
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const lastPathRef = useRef<string>(location.pathname);

  // Register newly visited tabs & update last active timestamp
  useEffect(() => {
    if (isCurrentTab) {
      setMountedTabs(prev => {
        if (prev.has(location.pathname)) return prev;
        const next = new Set(prev);
        next.add(location.pathname);
        return next;
      });
      tabLastActiveRef.current[location.pathname] = Date.now();
    }
  }, [location.pathname, isCurrentTab]);

  // Periodic 30-minute cache eviction: inspect every 5 mins and prune tabs inactive for >= 30 mins
  useEffect(() => {
    const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 mins
    const MAX_INACTIVE_AGE = 30 * 60 * 1000; // 30 mins

    const timer = setInterval(() => {
      const now = Date.now();
      setMountedTabs(prev => {
        let hasChanges = false;
        const next = new Set(prev);

        for (const tab of prev) {
          // Never evict currently active page
          if (tab === location.pathname) continue;
          const lastActive = tabLastActiveRef.current[tab] || 0;
          if (now - lastActive > MAX_INACTIVE_AGE) {
            next.delete(tab);
            delete scrollPositionsRef.current[tab];
            hasChanges = true;
          }
        }

        return hasChanges ? next : prev;
      });
    }, CLEANUP_INTERVAL);

    return () => clearInterval(timer);
  }, [location.pathname]);

  const mainRef = useRef<HTMLElement>(null);

  // Seamless scroll position restoration per page
  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    // Save previous path's scroll position before switching
    if (lastPathRef.current) {
      scrollPositionsRef.current[lastPathRef.current] = mainEl.scrollTop;
    }

    // Restore incoming path's scroll position
    const targetScroll = scrollPositionsRef.current[location.pathname] || 0;
    mainEl.scrollTop = targetScroll;
    lastPathRef.current = location.pathname;
  }, [location.pathname]);

  const handleScroll = () => {
    if (mainRef.current) {
      scrollPositionsRef.current[location.pathname] = mainRef.current.scrollTop;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen min-h-[100dvh] bg-background text-foreground w-full relative selection:bg-primary selection:text-primary-foreground overflow-hidden">
      {/* iOS PWA Status Bar Blur Shield & Color Sampler */}
      <div 
        id="ios-status-bar-tint" 
        className="fixed top-0 left-0 right-0 h-[1px] bg-background z-[9999] pointer-events-none transition-colors duration-200" 
      />
      
      {/* Main Content Area with Keep-Alive View Stack */}
      <main 
        ref={mainRef} 
        onScroll={handleScroll}
        className="flex-1 w-full max-w-xl mx-auto overflow-y-auto px-5 pt-[calc(0.5rem+env(safe-area-inset-top,0px)+var(--ios-status-blur-offset,0px))] sm:pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--ios-status-blur-offset,0px))] pb-6 [scrollbar-gutter:stable]"
      >
        {/* Keep-Alive Tab Views */}
        {mountedTabs.has('/') && (
          <div style={{ display: location.pathname === '/' ? 'block' : 'none' }}>
            <Dashboard />
          </div>
        )}
        {mountedTabs.has('/budgets') && (
          <div style={{ display: location.pathname === '/budgets' ? 'block' : 'none' }}>
            <Budgets />
          </div>
        )}
        {mountedTabs.has('/accounts') && (
          <div style={{ display: location.pathname === '/accounts' ? 'block' : 'none' }}>
            <Accounts />
          </div>
        )}
        {mountedTabs.has('/contacts') && (
          <div style={{ display: location.pathname === '/contacts' ? 'block' : 'none' }}>
            <Contacts />
          </div>
        )}

        {/* Sub-routes and detail pages rendered via standard Outlet */}
        {!isCurrentTab && <Outlet />}
      </main>

      {/* Bottom Navigation - Responsive Height with Safe Area Docking */}
      <nav id="bottom-nav" className="flex-none w-full bg-background/90 backdrop-blur-xl border-t border-border z-50 pb-[env(safe-area-inset-bottom,0px)]">
        <div id="bottom-nav-inner" className="w-full max-w-xl mx-auto flex justify-around items-center h-14 sm:h-16">
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
                  <DropdownMenuContent align="center" className="mb-4 w-max bg-card text-card-foreground border border-border shadow-none rounded-xl p-1.5">
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
                      
                      <DropdownMenuItem onClick={() => handleOpenAddModal('loan', 'lend')} className="flex flex-col items-center justify-center p-2 w-16 gap-1 cursor-pointer rounded-md">
                        <HandCoins className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                        <span className="text-[11px] font-medium">{t('add.lend')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.lend}</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => handleOpenAddModal('loan', 'borrow')} className="flex flex-col items-center justify-center p-2 w-16 gap-1 cursor-pointer rounded-md">
                        <Coins className="w-5 h-5 text-foreground mb-0.5" strokeWidth={2} />
                        <span className="text-[11px] font-medium">{t('add.borrow')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{currencySymbol}{stats.borrow}</span>
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 outline-none cursor-pointer",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={item.label}
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
        initialToAccountId={addModalInitialToAccountId}
        initialAmount={addModalInitialAmount}
        initialAccountId={addModalInitialAccountId}
        initialCategoryId={addModalInitialCategoryId}
        initialNote={addModalInitialNote}
      />

      <TransactionDetailsDialog 
        transactionId={viewingTransactionId} 
        onClose={() => setViewingTransactionId(null)} 
      />

      <Toaster />
    </div>
  );
}
