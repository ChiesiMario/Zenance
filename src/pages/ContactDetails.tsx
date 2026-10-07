import { useParams, useNavigate } from 'react-router-dom';
import { useContacts } from '@/hooks/useContacts';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Edit, Trash2, ArchiveRestore, ArrowUpRight, ArrowDownLeft, User, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { cn, sortTransactionsDesc } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { MagnitudeBadge } from '@/components/ui/MagnitudeBadge';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';

export default function ContactDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { allContacts, updateContact, deleteContact, archiveContact, unarchiveContact } = useContacts();
  const { transactions } = useTransactions();
  const { activeLedgerId, openAddModal } = useAppStore();
  const { ledgers } = useLedgers();
  
  const contact = allContacts?.find(a => a.id === id);
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currency = contact?.currency || baseCurrency;
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('personal');
  const [deleteError, setDeleteError] = useState('');
  
  useEffect(() => {
    if (contact) {
      setEditName(contact.name);
      setEditGroup(contact.group || 'personal');
      setDeleteError('');
    }
  }, [contact, isEditDialogOpen]);

  // Include transactions associated with this contact (loans & transfers)
  const contactTransactions = useMemo(() => {
    const list = transactions?.filter(tx => 
      !tx.deleted && (tx.accountId === id || tx.toAccountId === id)
    ) || [];
    return sortTransactionsDesc(list);
  }, [transactions, id]);

  const isLoading = transactions === undefined || allContacts === undefined;

  const {
    totalLent,
    totalBorrowed,
    netBalance,
  } = useMemo(() => {
    if (isLoading || !contact) {
      return {
        loanBalance: undefined,
        totalLent: undefined,
        totalBorrowed: undefined,
        netBalance: undefined,
      };
    }

    let bal = 0;
    let lent = 0;
    let borrowed = 0;
    
    contactTransactions.forEach(tx => {
      if (tx.deleted || tx.isGift) return;
      if (tx.type === 'transfer' || tx.type === 'loan') {
        if (tx.toAccountId === id) { // transfer / loan TO contact (lent/advanced)
          const inAmt = tx.transferInAmount ?? tx.originalAmount ?? tx.amount;
          bal += inAmt;
          lent += inAmt;
        }
        if (tx.accountId === id) { // transfer / loan FROM contact (repaid/borrowed)
          const outAmt = tx.originalAmount ?? tx.amount;
          bal -= outAmt;
          borrowed += outAmt;
        }
      }
    });

    return {
      loanBalance: bal,
      totalLent: Math.round(lent * 100) / 100,
      totalBorrowed: Math.round(borrowed * 100) / 100,
      netBalance: Math.round(bal * 100) / 100,
    };
  }, [contactTransactions, id, isLoading, contact]);

  if (allContacts !== undefined && !contact) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <p>{t('contacts.contactNotFound', 'Contact not found.')}</p>
        <Button variant="outline" onClick={() => navigate('/contacts')}>{t('common.back')}</Button>
      </div>
    );
  }

  const handleUpdate = async () => {
    if (!editName.trim() || !id) return;
    await updateContact(id, {
      name: editName.trim(),
      group: editGroup
    });
    setIsEditDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const res = await deleteContact(id);
    if (!res.success) {
      setDeleteError(res.reason === 'has_transactions' ? t('contacts.cannotDeleteHasTransactions', 'Cannot delete contact with existing transactions. You can archive it instead.') : t('common.error'));
    } else {
      navigate('/contacts');
    }
  };
  
  const handleArchive = async () => {
    if (!id) return;
    if (contact?.archived) {
      await unarchiveContact(id);
    } else {
      await archiveContact(id);
    }
    navigate('/contacts');
  };


  return (
    <div className="w-full space-y-4 pb-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contacts')} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 px-2 overflow-hidden">
          {contact?.group === 'organization' ? (
            <Building2 className="w-5 h-5 text-muted-foreground shrink-0" />
          ) : (
            <User className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
          <h2 className="text-xl font-semibold tracking-tight truncate">{contact?.name}</h2>
          {contact?.archived && (
            <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-sm font-normal shrink-0">
              {t('contacts.archived', '已歸檔')}
            </span>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsEditDialogOpen(true)} 
          className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground cursor-pointer"
          title={t('contacts.editContact', 'Edit Contact')}
        >
          <Edit className="h-4 w-4" />
        </Button>
      </div>

      {/* Net Balance & Metrics Card */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground shadow-none">
        <div className="p-8 border-b border-border flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center h-5 mb-2 w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">
              {netBalance === undefined
                ? '\u00A0'
                : netBalance === 0
                  ? t('contacts.settled')
                  : netBalance > 0
                    ? t('contacts.owesYou')
                    : t('contacts.youOwe')}
            </p>
            <div className="absolute right-0 flex items-center">
              <MagnitudeBadge
                amount={netBalance !== undefined ? Math.abs(netBalance) : undefined}
                memoryKey={`contact-net-balance-${id}`}
              />
            </div>
          </div>
          <AutoMarquee
            align="center"
            className={cn(
              "text-4xl sm:text-5xl font-mono tracking-tighter font-medium leading-none px-4",
              netBalance === undefined || netBalance === 0
                ? "text-foreground"
                : netBalance > 0
                  ? "text-emerald-500"
                  : "text-rose-500"
            )}
          >
            <AmountDisplay 
              amount={netBalance !== undefined ? Math.abs(netBalance) : undefined} 
              baseCurrency={currency} 
              type="neutral" 
              memoryKey={`contact-net-balance-${id}`}
            />
          </AutoMarquee>
        </div>

        {/* 2-Column Metrics Breakdown */}
        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('contacts.totalLent')}</p>
              <MagnitudeBadge amount={totalLent} memoryKey={`contact-total-lent-${id}`} />
            </div>
            <div className={cn("text-2xl font-mono tracking-tight font-medium leading-none", totalLent === 0 ? "text-foreground" : "text-emerald-500")}>
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={totalLent} 
                  baseCurrency={currency} 
                  type="neutral" 
                  memoryKey={`contact-total-lent-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center justify-between h-5 mb-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground leading-none">{t('contacts.totalBorrowed')}</p>
              <MagnitudeBadge amount={totalBorrowed} memoryKey={`contact-total-borrowed-${id}`} />
            </div>
            <div className={cn("text-2xl font-mono tracking-tight font-medium leading-none", totalBorrowed === 0 ? "text-foreground" : "text-rose-500")}>
              <AutoMarquee align="left">
                <AmountDisplay 
                  amount={totalBorrowed} 
                  baseCurrency={currency} 
                  type="neutral" 
                  memoryKey={`contact-total-borrowed-${id}`}
                />
              </AutoMarquee>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="flex border border-border rounded-lg overflow-hidden bg-card text-card-foreground divide-x divide-border shadow-none">
        <button 
          onClick={() => id && openAddModal('loan', 'lend', id)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          <span>{t('add.lend')}</span>
        </button>
        <button 
          onClick={() => id && openAddModal('loan', 'borrow', id)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
          <span>{t('add.borrow')}</span>
        </button>
      </div>

      {/* Transactions History List */}
      <GroupedTransactionList
        transactions={contactTransactions}
        contextContactId={id}
        title={
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('dashboard.recentTransactions')}
            </h3>
            <span className="text-xs font-mono text-muted-foreground">
              {t('reimbursements.items', { count: contactTransactions.length })}
            </span>
          </div>
        }
      />

      {/* Edit Contact Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-center">{t('contacts.editContact', 'Edit Contact')}</DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-5">
            {/* 無邊界大字體名稱輸入區 */}
            <div className="flex flex-col items-center justify-center pt-2 pb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                {t('contacts.contactName')}
              </span>
              <input 
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && editName.trim() && handleUpdate()}
                placeholder={t('contacts.namePlaceholder')}
                className="w-full text-center text-3xl font-bold tracking-tight bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
            
            {/* Vercel Usage 風格屬性清單卡片 */}
            <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {t('contacts.category')}
                </span>
                <Select value={editGroup} onValueChange={(val) => { if (val) setEditGroup(val); }}>
                  <SelectTrigger className="!h-auto !py-0 !px-0 !border-none !bg-transparent shadow-none focus-visible:border-none focus-visible:ring-0 text-sm font-medium justify-end gap-1.5 cursor-pointer">
                    <SelectValue className="flex-none text-right">
                      {editGroup === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">{t('contacts.groupPersonal')}</SelectItem>
                    <SelectItem value="organization">{t('contacts.groupOrganization')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deleteError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-md text-center">
                {deleteError}
              </div>
            )}
            
            {/* 幽靈輔助操作（歸檔 · 刪除） */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleArchive}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                <span>{contact?.archived ? t('contacts.unarchiveContact') : t('contacts.archiveContact')}</span>
              </button>
              
              <span className="text-border select-none">·</span>

              <button
                type="button"
                onClick={handleDelete}
                disabled={contactTransactions.length > 0}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('contacts.deleteContact')}</span>
              </button>
            </div>
            
            {contactTransactions.length > 0 && (
              <p className="text-[11px] text-muted-foreground text-center leading-normal px-2">
                {t('contacts.cannotDeleteHasTransactions')}
              </p>
            )}
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:gap-2 pt-2">
            <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button onClick={handleUpdate} disabled={!editName.trim()} className="cursor-pointer">
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
