import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { SetupGuard } from './components/layout/SetupGuard';
import { LockGuard } from './components/security/LockGuard';

// 路由級動態代碼分割 (Code Splitting)，徹底卸載非首屏巨型依賴 (如 JSZip、報表等)
const Setup = lazy(() => import('./pages/Setup'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Categories = lazy(() => import('./pages/Categories'));
const ArchivedCategories = lazy(() => import('./pages/ArchivedCategories'));
const CategoryDetails = lazy(() => import('./pages/CategoryDetails'));
const BudgetHistory = lazy(() => import('./pages/BudgetHistory'));
const BudgetDetails = lazy(() => import('./pages/BudgetDetails'));
const AccountDetails = lazy(() => import('./pages/AccountDetails'));
const ContactDetails = lazy(() => import('./pages/ContactDetails'));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground" />
      }
    >
      {children}
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: '/setup',
    element: (
      <LazyRoute>
        <Setup />
      </LazyRoute>
    ),
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
        element: (
          <LazyRoute>
            <AccountDetails />
          </LazyRoute>
        ),
      },
      {
        path: 'contacts',
        element: null,
      },
      {
        path: 'contacts/:id',
        element: (
          <LazyRoute>
            <ContactDetails />
          </LazyRoute>
        ),
      },
      {
        path: 'budgets',
        element: null,
      },
      {
        path: 'budgets/history',
        element: (
          <LazyRoute>
            <BudgetHistory />
          </LazyRoute>
        ),
      },
      {
        path: 'budgets/:id',
        element: (
          <LazyRoute>
            <BudgetDetails />
          </LazyRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <LazyRoute>
            <Reports />
          </LazyRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <LazyRoute>
            <Settings />
          </LazyRoute>
        ),
      },
      {
        path: 'settings/categories',
        element: (
          <LazyRoute>
            <Categories />
          </LazyRoute>
        ),
      },
      {
        path: 'settings/categories/archived',
        element: (
          <LazyRoute>
            <ArchivedCategories />
          </LazyRoute>
        ),
      },
      {
        path: 'settings/categories/:id',
        element: (
          <LazyRoute>
            <CategoryDetails />
          </LazyRoute>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
