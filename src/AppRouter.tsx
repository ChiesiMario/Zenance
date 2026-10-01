import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import BudgetHistory from './pages/BudgetHistory';
import BudgetDetails from './pages/BudgetDetails';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import ArchivedCategories from './pages/ArchivedCategories';
import CategoryDetails from './pages/CategoryDetails';
import Setup from './pages/Setup';
import AccountDetails from './pages/AccountDetails';
import ContactDetails from './pages/ContactDetails';
import Reports from './pages/Reports';
import { SetupGuard } from './components/layout/SetupGuard';
import { LockGuard } from './components/security/LockGuard';

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
