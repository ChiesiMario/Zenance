import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { cn, getCurrencySymbol } from '@/lib/utils';

export default function Contacts() {
  const { t } = useTranslation();
  const { contacts, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  // Calculate balances for each contact
  const contactBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    if (!contacts || !transactions) return balances;

    // Initialize balances
    contacts.forEach(c => {
      balances[c.id] = 0;
    });

    transactions.forEach(tx => {
      // If money flows TO the contact account, the contact balance INCREASES
      // (This means they hold our money, i.e., Owes you)
      if (tx.type === 'transfer') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount; // transfer FROM contact
        if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += tx.amount; // transfer TO contact
      }
    });

    return balances;
  }, [contacts, transactions]);

  const handleAddContact = async () => {
    if (!newContactName.trim()) return;
    await addAccount(newContactName.trim(), 'contact');
    setNewContactName('');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t('contacts.contacts')}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" />}>
            <Plus className="h-5 w-5" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('contacts.addContact')}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input 
                placeholder={t('contacts.namePlaceholder')} 
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('contacts.cancel')}
              </DialogClose>
              <Button onClick={handleAddContact} disabled={!newContactName.trim()}>
                {t('contacts.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {(!contacts || contacts.length === 0) && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('contacts.noContacts')}
            </div>
          )}
          
          {contacts?.map(contact => {
            const balance = contactBalances[contact.id] || 0;
            return (
              <div key={contact.id} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">{contact.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium leading-none mb-1 block text-muted-foreground">
                    {balance === 0 ? t('contacts.settled') : balance > 0 ? t('contacts.owesYou') : t('contacts.youOwe')}
                  </span>
                  <span className={cn("text-xl font-mono tracking-tight font-medium", balance === 0 ? "text-muted-foreground" : balance > 0 ? "text-primary" : "text-destructive")}>
                    {currencySymbol}{Math.abs(balance).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
