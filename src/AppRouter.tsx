import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';

import Accounts from './pages/Accounts';
import Contacts from './pages/Contacts';
import Budgets from './pages/Budgets';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import AccountDetails from './pages/AccountDetails';
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
        path: 'budgets',
        element: <Budgets />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
