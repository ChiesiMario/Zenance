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
import { getCurrencySymbol } from '@/lib/utils';
import { ContactGroupCard } from '@/components/contacts/ContactGroupCard';

export default function Contacts() {
  const { t } = useTranslation();
  const { contacts, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactGroup, setNewContactGroup] = useState('personal');
  const [filterGroup, setFilterGroup] = useState<'all' | 'personal' | 'organization'>('all');

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

  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts || [];
    if (filterGroup === 'personal') {
      filtered = filtered.filter(c => c.group === 'personal' || c.group === 'other' || !c.group);
    } else if (filterGroup === 'organization') {
      filtered = filtered.filter(c => c.group === 'organization');
    }

    return filtered.sort((a, b) => {
      const aBalance = contactBalances[a.id] || 0;
      const bBalance = contactBalances[b.id] || 0;
      const aHasBalance = Math.abs(aBalance) > 0;
      const bHasBalance = Math.abs(bBalance) > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [contacts, filterGroup, contactBalances]);



  const handleAddContact = async () => {
    if (!newContactName.trim()) return;
    await addAccount(newContactName.trim(), 'contact', 0, undefined, newContactGroup);
    setNewContactName('');
    setNewContactGroup('personal');
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
            <div className="py-4 space-y-4">
              <Input 
                placeholder={t('contacts.namePlaceholder')} 
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
              />
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant={newContactGroup === 'personal' ? 'default' : 'outline'} 
                  className="flex-1" 
                  onClick={() => setNewContactGroup('personal')}
                >
                  {t('contacts.groupPersonal')}
                </Button>
                <Button 
                  type="button" 
                  variant={newContactGroup === 'organization' ? 'default' : 'outline'} 
                  className="flex-1" 
                  onClick={() => setNewContactGroup('organization')}
                >
                  {t('contacts.groupOrganization')}
                </Button>
              </div>
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

      <div className="space-y-6">
        <ContactGroupCard 
          title={
            <div className="flex gap-2">
              <Button 
                variant={filterGroup === 'all' ? 'default' : 'outline'} 
                onClick={() => setFilterGroup('all')}
                size="sm"
                className="rounded-full"
              >
                {t('contacts.all')}
              </Button>
              <Button 
                variant={filterGroup === 'personal' ? 'default' : 'outline'} 
                onClick={() => setFilterGroup('personal')}
                size="sm"
                className="rounded-full"
              >
                {t('contacts.groupPersonal')}
              </Button>
              <Button 
                variant={filterGroup === 'organization' ? 'default' : 'outline'} 
                onClick={() => setFilterGroup('organization')}
                size="sm"
                className="rounded-full"
              >
                {t('contacts.groupOrganization')}
              </Button>
            </div>
          }
          contacts={filteredAndSortedContacts}
          contactBalances={contactBalances}
          currencySymbol={currencySymbol}
          hideGroupTag={filterGroup !== 'all'}
        />
      </div>
    </div>
  );
}
