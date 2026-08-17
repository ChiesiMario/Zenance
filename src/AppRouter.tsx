import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import AddTransaction from './pages/AddTransaction';
import Accounts from './pages/Accounts';
import Contacts from './pages/Contacts';
import Budgets from './pages/Budgets';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
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
        path: 'add',
        element: <AddTransaction />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
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
