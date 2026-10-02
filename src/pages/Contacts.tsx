import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useContacts } from '@/hooks/useContacts';
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
import { cn, getCurrencySymbol } from '@/lib/utils';
import { ContactGroupCard } from '@/components/contacts/ContactGroupCard';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { calculateAccountBalances, convertAmount } from '@/lib/currency';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useBalanceSnapshots } from '@/hooks/useBalanceSnapshots';

export default function Contacts() {
  const { t } = useTranslation();
  const { contacts, archivedContacts, allContacts, addContact } = useContacts();
  const { transactions } = useTransactions();
  const { getRate } = useExchangeRates();
  const { latestSnapshotsMap } = useBalanceSnapshots();
  
  const [currentView, setCurrentView] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactGroup, setNewContactGroup] = useState('personal');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'organization'>('all');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = getCurrencySymbol(baseCurrency);

  // 匯總所有往來對象（含已歸檔），用於全面計算原生餘額
  const allContactsList = useMemo(() => {
    return allContacts || [...(contacts || []), ...(archivedContacts || [])];
  }, [allContacts, contacts, archivedContacts]);

  // 計算所有往來對象在各自原生幣種下的餘額 (支援月度餘額快照加速)
  const contactBalances = useMemo(() => {
    if (!allContactsList || allContactsList.length === 0) return {};
    return calculateAccountBalances(allContactsList, transactions || [], getRate, baseCurrency, latestSnapshotsMap);
  }, [allContactsList, transactions, getRate, baseCurrency, latestSnapshotsMap]);

  // 判斷是否存在非基準幣種往來
  const hasForeignCurrency = useMemo(() => {
    return allContactsList.some(
      c => (c.currency || baseCurrency) !== baseCurrency && (contactBalances[c.id] || 0) !== 0
    );
  }, [allContactsList, baseCurrency, contactBalances]);

  // 統計所有往來對象折算基準幣種後的應收、應還與往來淨額
  const { totalReceivable, totalPayable, netBalance } = useMemo(() => {
    let receivable = 0;
    let payable = 0;

    allContactsList.forEach(c => {
      const raw = contactBalances[c.id] || 0;
      const curr = c.currency || baseCurrency;
      const converted = convertAmount(raw, curr, baseCurrency, getRate);

      if (converted > 0) {
        receivable += converted;
      } else if (converted < 0) {
        payable += Math.abs(converted);
      }
    });

    return {
      totalReceivable: Math.round(receivable * 100) / 100,
      totalPayable: Math.round(payable * 100) / 100,
      netBalance: Math.round((receivable - payable) * 100) / 100,
    };
  }, [allContactsList, contactBalances, baseCurrency, getRate]);

  const filteredAndSortedContacts = useMemo(() => {
    let source = currentView === 'archived' ? (archivedContacts || []) : (contacts || []);
    if (filterType === 'personal') {
      source = source.filter(c => c.group === 'personal' || c.group === 'other' || !c.group);
    } else if (filterType === 'organization') {
      source = source.filter(c => c.group === 'organization');
    }

    return source.sort((a, b) => {
      const aNet = Math.abs(contactBalances[a.id] || 0);
      const bNet = Math.abs(contactBalances[b.id] || 0);
      const aHasBalance = aNet > 0;
      const bHasBalance = bNet > 0;

      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      if (aHasBalance && bHasBalance && aNet !== bNet) return bNet - aNet;
      
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [contacts, archivedContacts, currentView, filterType, contactBalances]);

  const handleAddContact = async () => {
    if (!newContactName.trim()) return;
    await addContact(newContactName.trim(), newContactGroup);
    setNewContactName('');
    setNewContactGroup('personal');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full">
      
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
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

      <div className="space-y-4">
        {currentView === 'active' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
          <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center relative">
            {hasForeignCurrency && (
              <span className="absolute top-4 right-4 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/20 select-none">
                ≈ {t('accounts.rateEstimated')}
              </span>
            )}
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('contacts.netBalance')}</p>
            <AutoMarquee align="center" className="text-4xl sm:text-5xl font-mono tracking-tighter font-medium px-2">
              <AmountDisplay 
                amount={netBalance} 
                baseCurrency={baseCurrency} 
                type="balance" 
                animated
              />
            </AutoMarquee>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-5 border-r border-border flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('contacts.receivable')}</p>
              <div className={cn("text-2xl font-mono tracking-tight font-medium", totalReceivable > 0 ? "text-emerald-500" : "text-foreground")}>
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalReceivable} 
                    baseCurrency={baseCurrency} 
                    type="neutral" 
                    animated
                  />
                </AutoMarquee>
              </div>
            </div>
            <div className="p-5 flex flex-col">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('contacts.payable')}</p>
              <div className={cn("text-2xl font-mono tracking-tight font-medium", totalPayable > 0 ? "text-rose-500" : "text-foreground")}>
                <AutoMarquee align="left">
                  <AmountDisplay 
                    amount={totalPayable} 
                    baseCurrency={baseCurrency} 
                    type="neutral" 
                    animated
                  />
                </AutoMarquee>
              </div>
            </div>
          </div>
        </div>
      )}

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
          currencySymbol={currencySymbol}
          hideGroupTag={filterType !== 'all'}
          emptyMessage={currentView === 'archived' ? t('contacts.noArchivedContacts', '目前沒有任何已歸檔對象') : undefined}
        />
      </div>
      </div>
    </div>
  );
}
