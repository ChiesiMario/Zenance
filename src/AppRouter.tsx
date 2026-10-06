import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { SetupGuard } from './components/layout/SetupGuard';
import { LockGuard } from './components/security/LockGuard';

// 全頁面靜態直載 (Static Direct Import)，徹底消除次級頁面首次載入 1-2 秒白屏延遲，實現原生 App 級 0ms 秒開
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Categories from './pages/Categories';
import ArchivedCategories from './pages/ArchivedCategories';
import CategoryDetails from './pages/CategoryDetails';
import BudgetHistory from './pages/BudgetHistory';
import BudgetDetails from './pages/BudgetDetails';
import AccountDetails from './pages/AccountDetails';
import ContactDetails from './pages/ContactDetails';

const router = createBrowserRouter([
  {
    path: '/setup',
    element: <Setup />,
  },
  {
    path: '/',
    element: (
      <SetupGuard>
        <LockGuard>
          <AppLayout />
        </LockGuard>
      </SetupGuard>
    ),
    children: [
      {
        index: true,
        element: null,
      },
      {
        path: 'accounts',
        element: null,
      },
      {
        path: 'accounts/:id',
        element: <AccountDetails />,
      },
      {
        path: 'contacts',
        element: null,
      },
      {
        path: 'contacts/:id',
        element: <ContactDetails />,
      },
      {
        path: 'budgets',
        element: null,
      },
      {
        path: 'budgets/history',
        element: <BudgetHistory />,
      },
      {
        path: 'budgets/:id',
        element: <BudgetDetails />,
      },
      {
        path: 'reports',
        element: <Reports />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'settings/categories',
        element: <Categories />,
      },
      {
        path: 'settings/categories/archived',
        element: <ArchivedCategories />,
      },
      {
        path: 'settings/categories/:id',
        element: <CategoryDetails />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
