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
import { getCurrencySymbol, cn } from '@/lib/utils';
import { ContactGroupCard } from '@/components/contacts/ContactGroupCard';
import { ReimbursementList } from '@/components/contacts/ReimbursementList';

export default function Contacts() {
  const { t } = useTranslation();
  const { contacts, archivedContacts, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [mainTab, setMainTab] = useState<'contacts' | 'reimbursements'>('contacts');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactGroup, setNewContactGroup] = useState('personal');
  const [filterGroup, setFilterGroup] = useState<'all' | 'personal' | 'organization' | 'archived'>('all');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  // Count of pending reimbursements
  const pendingReimbursementsCount = useMemo(() => {
    if (!transactions) return 0;
    return transactions.filter(t => !t.deleted && t.reimbursementStatus === 'pending').length;
  }, [transactions]);

  // Calculate balances for each contact
  const contactBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    const allContacts = [...(contacts || []), ...(archivedContacts || [])];
    if (!allContacts || !transactions) return balances;

    // Initialize balances
    allContacts.forEach(c => {
      balances[c.id] = 0;
    });

    transactions.forEach(tx => {
      // If money flows TO the contact account, the contact balance INCREASES
      // (This means they hold our money, i.e., Owes you)
      if (tx.type === 'transfer' || tx.type === 'loan') {
        if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= tx.amount; // transfer FROM contact
        if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += tx.amount; // transfer TO contact
      }
    });

    return balances;
  }, [contacts, archivedContacts, transactions]);

  // Calculate pending reimbursements for each contact
  const contactReimbursements = useMemo(() => {
    const reimbursements: Record<string, number> = {};
    const allContacts = [...(contacts || []), ...(archivedContacts || [])];
    if (!allContacts || !transactions) return reimbursements;

    allContacts.forEach(c => {
      reimbursements[c.id] = 0;
    });

    transactions.forEach(tx => {
      if (!tx.deleted && tx.reimbursementStatus === 'pending' && tx.reimbursementContactId && reimbursements[tx.reimbursementContactId] !== undefined) {
        reimbursements[tx.reimbursementContactId] += tx.amount;
      }
    });

    return reimbursements;
  }, [contacts, archivedContacts, transactions]);

  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts || [];
    if (filterGroup === 'archived') {
      filtered = archivedContacts || [];
    } else if (filterGroup === 'personal') {
      filtered = filtered.filter(c => c.group === 'personal' || c.group === 'other' || !c.group);
    } else if (filterGroup === 'organization') {
      filtered = filtered.filter(c => c.group === 'organization');
    }

    return filtered.sort((a, b) => {
      const aNet = Math.abs((contactBalances[a.id] || 0) + (contactReimbursements[a.id] || 0));
      const bNet = Math.abs((contactBalances[b.id] || 0) + (contactReimbursements[b.id] || 0));
      const aHasBalance = aNet > 0;
      const bHasBalance = bNet > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      if (aHasBalance && bHasBalance && aNet !== bNet) return bNet - aNet;
      
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [contacts, archivedContacts, filterGroup, contactBalances, contactReimbursements]);

  const handleAddContact = async () => {
    if (!newContactName.trim()) return;
    await addAccount(newContactName.trim(), 'contact', 0, undefined, newContactGroup);
    setNewContactName('');
    setNewContactGroup('personal');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      
      {/* Top Header with Segmented Navigation and Action */}
      <div className="flex items-center justify-between">
        <div className="flex bg-muted/60 p-1 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setMainTab('contacts')}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
              mainTab === 'contacts'
                ? "bg-background text-foreground font-semibold shadow-none"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t('contacts.contacts')}
          </button>
          <button
            type="button"
            onClick={() => setMainTab('reimbursements')}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
              mainTab === 'reimbursements'
                ? "bg-background text-foreground font-semibold shadow-none"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{t('reimbursements.title')}</span>
            {pendingReimbursementsCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold">
                {pendingReimbursementsCount}
              </span>
            )}
          </button>
        </div>

        {mainTab === 'contacts' && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" />}>
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
                    className="flex-1 cursor-pointer" 
                    onClick={() => setNewContactGroup('personal')}
                  >
                    {t('contacts.groupPersonal')}
                  </Button>
                  <Button 
                    type="button" 
                    variant={newContactGroup === 'organization' ? 'default' : 'outline'} 
                    className="flex-1 cursor-pointer" 
                    onClick={() => setNewContactGroup('organization')}
                  >
                    {t('contacts.groupOrganization')}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" className="cursor-pointer" />}>
                  {t('contacts.cancel')}
                </DialogClose>
                <Button onClick={handleAddContact} disabled={!newContactName.trim()} className="cursor-pointer">
                  {t('contacts.add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tab Content */}
      {mainTab === 'contacts' ? (
        <div className="space-y-6">
          <ContactGroupCard 
            title={
              <div className="flex gap-2">
                <Button 
                  variant={filterGroup === 'all' ? 'default' : 'outline'} 
                  onClick={() => setFilterGroup('all')}
                  size="sm"
                  className="rounded-full cursor-pointer"
                >
                  {t('contacts.all')}
                </Button>
                <Button 
                  variant={filterGroup === 'personal' ? 'default' : 'outline'} 
                  onClick={() => setFilterGroup('personal')}
                  size="sm"
                  className="rounded-full cursor-pointer"
                >
                  {t('contacts.groupPersonal')}
                </Button>
                <Button 
                  variant={filterGroup === 'organization' ? 'default' : 'outline'} 
                  onClick={() => setFilterGroup('organization')}
                  size="sm"
                  className="rounded-full cursor-pointer"
                >
                  {t('contacts.groupOrganization')}
                </Button>
                <Button 
                  variant={filterGroup === 'archived' ? 'default' : 'outline'} 
                  onClick={() => setFilterGroup('archived')}
                  size="sm"
                  className="rounded-full cursor-pointer"
                >
                  {t('contacts.archived')}
                </Button>
              </div>
            }
            contacts={filteredAndSortedContacts}
            contactBalances={contactBalances}
            contactReimbursements={contactReimbursements}
            currencySymbol={currencySymbol}
            hideGroupTag={filterGroup !== 'all'}
          />
        </div>
      ) : (
        <ReimbursementList />
      )}
    </div>
  );
}
