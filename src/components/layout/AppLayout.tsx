import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, Plus, Wallet, PieChart, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useExchangeRates } from '@/hooks/useExchangeRates';

export function AppLayout() {
  const location = useLocation();
  const { t } = useTranslation();
  useExchangeRates(); // Trigger background sync

  const navItems = [
    { path: '/', label: t('nav.overview'), icon: Home },
    { path: '/budgets', label: t('nav.budgets'), icon: PieChart },
    { path: '/accounts', label: t('nav.accounts'), icon: Wallet },
    { path: '/contacts', label: t('nav.contacts'), icon: Users },
    { path: '/add', label: t('nav.add'), icon: Plus },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background text-foreground w-full relative selection:bg-primary selection:text-primary-foreground">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto overflow-y-auto pb-24 px-5 pt-8">
        <Outlet />
      </main>

      {/* Bottom Navigation - Frosted Glass */}
      <nav className="fixed bottom-0 w-full bg-background/80 backdrop-blur-xl border-t border-border flex justify-around items-center h-16 pb-safe z-50">
        <div className="w-full max-w-xl mx-auto flex justify-around items-center h-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-6 transition-transform duration-300", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 1.5} />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
