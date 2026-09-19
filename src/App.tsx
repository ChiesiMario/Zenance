import { AppRouter } from './AppRouter';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';

function App() {
  return (
    <ConfirmDialogProvider>
      <AppRouter />
    </ConfirmDialogProvider>
  );
}

export default App;
