import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';

import Accounts from './pages/Accounts';
import Contacts from './pages/Contacts';
import Budgets from './pages/Budgets';
import BudgetHistory from './pages/BudgetHistory';
import BudgetDetails from './pages/BudgetDetails';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import ArchivedCategories from './pages/ArchivedCategories';
import CategoryDetails from './pages/CategoryDetails';
import Setup from './pages/Setup';
import AccountDetails from './pages/AccountDetails';
import ContactDetails from './pages/ContactDetails';
import { SetupGuard } from './components/layout/SetupGuard';

const router = createBrowserRouter([
  {
    path: '/setup',
    element: <Setup />,
  },
  {
    path: '/',
    element: (
      <SetupGuard>
        <AppLayout />
      </SetupGuard>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'accounts/:id',
        element: <AccountDetails />,
      },
      {
        path: 'contacts',
        element: <Contacts />,
      },
      {
        path: 'contacts/:id',
        element: <ContactDetails />,
      },
      {
        path: 'budgets',
        element: <Budgets />,
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
