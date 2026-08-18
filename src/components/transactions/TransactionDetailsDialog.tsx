import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { getCurrencySymbol } from '@/lib/utils';
import { useMemo } from 'react';

interface Props {
  transactionId: string | null;
  onClose: () => void;
}

export function TransactionDetailsDialog({ transactionId, onClose }: Props) {
  const { t } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();

  const selectedTransaction = useMemo(() => {
    if (!transactionId || !transactions) return null;
    return transactions.find(tx => tx.id === transactionId) || null;
  }, [transactionId, transactions]);

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  const getAccountName = (accountId: string) => {
    return accounts?.find(a => a.id === accountId)?.name || accountId;
  };

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'transfer') return t('add.transfer');
    return categories?.find(c => c.id === categoryId)?.name || categoryId;
  };

  const handleDelete = async () => {
    if (!transactionId) return;
    await deleteTransaction(transactionId);
    onClose();
  };

  if (!selectedTransaction) return null;

  return (
    <Dialog open={!!transactionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('dashboard.detail')}</DialogTitle>
        </DialogHeader>
        
        <div className="py-2">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-1">
              <p className="text-sm text-muted-foreground uppercase tracking-widest">{getCategoryName(selectedTransaction.category)}</p>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">#{selectedTransaction.displayId || selectedTransaction.id.split('-')[0].toUpperCase()}</span>
            </div>
            <p className={`text-5xl font-mono tracking-tighter font-medium ${selectedTransaction.type === 'income' ? 'text-primary' : (selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan') ? 'text-blue-500' : 'text-foreground'}`}>
              {selectedTransaction.type === 'expense' ? '-' : (selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan') ? '' : '+'}{currencySymbol}{selectedTransaction.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="border border-border rounded-lg bg-card overflow-hidden divide-y divide-border text-sm">
            
            {selectedTransaction.originalCurrency && selectedTransaction.originalCurrency !== activeLedger?.baseCurrency && (
              <div className="flex min-h-12 md:min-h-10 justify-between items-center px-4 md:px-3 py-2 bg-muted/10">
                <span className="text-muted-foreground">{t('dashboard.original')}</span>
                <span className="font-mono">{selectedTransaction.originalAmount?.toLocaleString()} {selectedTransaction.originalCurrency}</span>
              </div>
            )}
            {selectedTransaction.originalCurrency && selectedTransaction.originalCurrency !== activeLedger?.baseCurrency && (
              <div className="flex min-h-12 md:min-h-10 justify-between items-center px-4 md:px-3 py-2 bg-muted/10">
                <span className="text-muted-foreground">{t('dashboard.rate')}</span>
                <span className="font-mono">{selectedTransaction.exchangeRate?.toFixed(4)}</span>
              </div>
            )}

            <div className="flex min-h-12 justify-between items-center px-4 py-2">
              <span className="text-muted-foreground">{t('add.date')}</span>
              <span className="font-medium">{selectedTransaction.date}</span>
            </div>
            
            {(selectedTransaction.type === 'transfer' || selectedTransaction.type === 'loan') ? (
              <div className="flex min-h-12 md:min-h-10 justify-between items-center px-4 md:px-3 py-2">
                <span className="text-muted-foreground">{selectedTransaction.type === 'transfer' ? t('dashboard.transferDetail') : t('add.loan')}</span>
                <span className="font-medium">
                  {getAccountName(selectedTransaction.accountId)} → {selectedTransaction.toAccountId ? getAccountName(selectedTransaction.toAccountId) : '-'}
                </span>
              </div>
            ) : (
              <div className="flex min-h-12 md:min-h-10 justify-between items-center px-4 md:px-3 py-2">
                <span className="text-muted-foreground">{t('add.account')}</span>
                <span className="font-medium">{getAccountName(selectedTransaction.accountId)}</span>
              </div>
            )}
            
            {selectedTransaction.note && (
              <div className="flex min-h-12 md:min-h-10 justify-between items-center px-4 md:px-3 py-2">
                <span className="text-muted-foreground">{t('add.note')}</span>
                <span className="font-medium">{selectedTransaction.note}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center mt-2 border-t pt-4 border-border">
            <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            {t('dashboard.delete')}
            </Button>
            <DialogClose render={<Button variant="outline" type="button" />}>
            {t('dashboard.close')}
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
