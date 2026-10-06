import { Navigate, useLocation } from 'react-router-dom';
import { useLedgers } from '@/hooks/useLedgers';

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const { ledgers } = useLedgers();
  const location = useLocation();

  // If ledgers is undefined, Dexie is still loading
  if (ledgers === undefined) {
    return <div className="h-full min-h-full bg-background" />;
  }

  // If there are no ledgers and we are not on the setup page, redirect to setup
  if (ledgers.length === 0 && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}
