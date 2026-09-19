import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCurrencySymbol } from '@/lib/utils';
import { ContactGroupCard } from '@/components/contacts/ContactGroupCard';

export default function Contacts() {
  const { t } = useTranslation();
  const { contacts, archivedContacts, addAccount } = useAccounts();
  const { transactions } = useTransactions();
  
  const [currentView, setCurrentView] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactGroup, setNewContactGroup] = useState('personal');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'organization'>('all');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  // 建立 parentId -> 子回款總額 map
  const childRefundsMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions?.forEach(t => {
      if (!t.deleted && t.parentId && t.type === 'income') {
        map[t.parentId] = (map[t.parentId] || 0) + t.amount;
      }
    });
    return map;
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
      if (tx.deleted) return;
      // 代付交易（帶有 reimbursementStatus）由下方 contactReimbursements 統計待收款項，排除以避免重複計算
      const isAdvance = (tx.reimbursementContactId || tx.toAccountId) && !!tx.reimbursementStatus;
      if (isAdvance) return;

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
      if (!tx.deleted && tx.reimbursementStatus === 'pending') {
        const contactId = tx.reimbursementContactId || (tx.type === 'loan' ? tx.toAccountId : undefined);
        if (contactId && reimbursements[contactId] !== undefined) {
          const refunded = childRefundsMap[tx.id] || 0;
          const remaining = Math.max(0, Math.round((tx.amount - refunded) * 100) / 100);
          reimbursements[contactId] += remaining;
        }
      }
    });

    return reimbursements;
  }, [contacts, archivedContacts, transactions, childRefundsMap]);

  const filteredAndSortedContacts = useMemo(() => {
    let source = currentView === 'archived' ? (archivedContacts || []) : (contacts || []);
    if (filterType === 'personal') {
      source = source.filter(c => c.group === 'personal' || c.group === 'other' || !c.group);
    } else if (filterType === 'organization') {
      source = source.filter(c => c.group === 'organization');
    }

    return source.sort((a, b) => {
      const aNet = Math.abs((contactBalances[a.id] || 0) + (contactReimbursements[a.id] || 0));
      const bNet = Math.abs((contactBalances[b.id] || 0) + (contactReimbursements[b.id] || 0));
      const aHasBalance = aNet > 0;
      const bHasBalance = bNet > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      if (aHasBalance && bHasBalance && aNet !== bNet) return bNet - aNet;
      
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [contacts, archivedContacts, currentView, filterType, contactBalances, contactReimbursements]);

  const handleAddContact = async () => {
    if (!newContactName.trim()) return;
    await addAccount(newContactName.trim(), 'contact', 0, undefined, newContactGroup);
    setNewContactName('');
    setNewContactGroup('personal');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center text-xl font-semibold tracking-tight hover:bg-muted/50 data-[state=open]:bg-muted/50 rounded-md px-2 -ml-2 py-1 outline-none cursor-pointer">
            <span>
              {currentView === 'archived' ? t('contacts.archived', '已歸檔') : t('contacts.contacts')}
            </span>
            <ChevronDown className="ml-1 h-4 w-4 opacity-50 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[140px]">
            <DropdownMenuItem 
              onClick={() => setCurrentView('active')}
              className="justify-between cursor-pointer"
            >
              <span>{t('contacts.contacts')}</span>
              {currentView === 'active' && <Check className="h-4 w-4 text-foreground shrink-0" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setCurrentView('archived')}
              className="justify-between cursor-pointer"
            >
              <span>{t('contacts.archived', '已歸檔')}</span>
              {currentView === 'archived' && <Check className="h-4 w-4 text-foreground shrink-0" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {currentView === 'active' ? (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" />}>
              <Plus className="h-5 w-5" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[300px]">
              <DialogHeader>
                <DialogTitle>{t('contacts.addContact')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('contacts.type')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      type="button" 
                      variant={newContactGroup === 'personal' ? 'default' : 'outline'} 
                      className="cursor-pointer" 
                      onClick={() => setNewContactGroup('personal')}
                    >
                      {t('contacts.groupPersonal')}
                    </Button>
                    <Button 
                      type="button" 
                      variant={newContactGroup === 'organization' ? 'default' : 'outline'} 
                      className="cursor-pointer" 
                      onClick={() => setNewContactGroup('organization')}
                    >
                      {t('contacts.groupOrganization')}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('contacts.contactName')}
                  </label>
                  <Input 
                    placeholder={t('contacts.namePlaceholder')} 
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" className="cursor-pointer" />}>
                  {t('contacts.cancel')}
                </DialogClose>
                <Button onClick={handleAddContact} disabled={!newContactName.trim()} className="cursor-pointer">
                  {t('contacts.add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      {/* Contacts List */}
      <div className="space-y-6">
        <ContactGroupCard 
          title={
            <div className="flex gap-2">
              <Button 
                variant={filterType === 'all' ? 'default' : 'outline'} 
                onClick={() => setFilterType('all')}
                size="sm"
                className="rounded-full cursor-pointer"
              >
                {t('contacts.all')}
              </Button>
              <Button 
                variant={filterType === 'personal' ? 'default' : 'outline'} 
                onClick={() => setFilterType('personal')}
                size="sm"
                className="rounded-full cursor-pointer"
              >
                {t('contacts.groupPersonal')}
              </Button>
              <Button 
                variant={filterType === 'organization' ? 'default' : 'outline'} 
                onClick={() => setFilterType('organization')}
                size="sm"
                className="rounded-full cursor-pointer"
              >
                {t('contacts.groupOrganization')}
              </Button>
            </div>
          }
          contacts={filteredAndSortedContacts}
          contactBalances={contactBalances}
          contactReimbursements={contactReimbursements}
          currencySymbol={currencySymbol}
          hideGroupTag={filterType !== 'all'}
          emptyMessage={currentView === 'archived' ? t('contacts.noArchivedContacts', '目前沒有任何已歸檔對象') : undefined}
        />
      </div>
    </div>
  );
}
