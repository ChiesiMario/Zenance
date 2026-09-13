import { useParams, useNavigate } from 'react-router-dom';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Edit, Trash2, ArchiveRestore, ArrowUpRight, ArrowDownLeft, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { SettleReimbursementDialog } from '@/components/contacts/SettleReimbursementDialog';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';

export default function ContactDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { contacts, updateAccount, deleteAccount, archiveAccount } = useAccounts();
  const { transactions } = useTransactions();
  const { activeLedgerId, openAddModal } = useAppStore();
  const { ledgers } = useLedgers();
  
  const contact = contacts?.find(a => a.id === id);
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
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

  if (!contact && contacts && contacts.length > 0) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
        <p>{t('contacts.contactNotFound', 'Contact not found.')}</p>
        <Button variant="outline" onClick={() => navigate('/contacts')}>{t('dashboard.close', 'Go back')}</Button>
      </div>
    );
  }

  // Include transactions associated with this contact:
  // 1. Where accountId or toAccountId is the contact (loans & transfers)
  // 2. Where reimbursementContactId is the contact (reimbursements & refunds)
  const contactTransactions = useMemo(() => {
    return transactions?.filter(tx => 
      !tx.deleted && (tx.accountId === id || tx.toAccountId === id || tx.reimbursementContactId === id)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];
  }, [transactions, id]);

  const {
    totalLent,
    totalBorrowed,
    pendingReimbursement,
    netBalance,
    pendingTxs,
  } = useMemo(() => {
    let bal = 0;
    let lent = 0;
    let borrowed = 0;
    let pendingReimb = 0;
    let settledReimb = 0;
    const pendingList: typeof contactTransactions = [];
    
    contactTransactions.forEach(tx => {
      if (tx.type === 'transfer' || tx.type === 'loan') {
        if (tx.accountId === id) { // transfer FROM contact
          bal -= tx.amount;
          borrowed += tx.amount;
        }
        if (tx.toAccountId === id) { // transfer TO contact
          bal += tx.amount;
          lent += tx.amount;
        }
      } else if (tx.reimbursementContactId === id && tx.type === 'expense') {
        if (tx.reimbursementStatus === 'pending') {
          pendingReimb += tx.amount;
          pendingList.push(tx);
        } else if (tx.reimbursementStatus === 'reimbursed') {
          settledReimb += tx.amount;
        }
      }
    });

    return {
      loanBalance: bal,
      totalLent: lent,
      totalBorrowed: borrowed,
      pendingReimbursement: pendingReimb,
      totalReimbursed: settledReimb,
      netBalance: bal + pendingReimb,
      pendingTxs: pendingList,
    };
  }, [contactTransactions, id]);

  const handleUpdate = async () => {
    if (!editName.trim() || !id) return;
    await updateAccount(id, {
      name: editName.trim(),
      group: editGroup
    });
    setIsEditDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const res = await deleteAccount(id);
    if (!res.success) {
      setDeleteError(res.reason === 'has_transactions' ? t('contacts.cannotDeleteHasTransactions', 'Cannot delete contact with existing transactions. You can archive it instead.') : t('common.error'));
    } else {
      navigate('/contacts');
    }
  };
  
  const handleArchive = async () => {
    if (!id) return;
    await archiveAccount(id);
    navigate('/contacts');
  };


  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6 pb-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contacts')} className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight truncate px-2">{contact?.name}</h2>
        <div className="w-8"></div>
      </div>

      {/* Net Balance & Metrics Card */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground shadow-none">
        <div className="p-8 border-b border-border flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            {netBalance === 0 ? t('contacts.settled') : netBalance > 0 ? t('contacts.owesYou') : t('contacts.youOwe')}
          </p>
          <div className={cn("text-6xl font-mono tracking-tighter font-medium break-all px-4", netBalance === 0 ? 'text-muted-foreground' : netBalance > 0 ? 'text-emerald-500' : 'text-destructive')}>
            <AmountDisplay amount={Math.abs(netBalance)} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
          </div>
        </div>

        {/* 3-Column Metrics Breakdown */}
        <div className="grid grid-cols-3 gap-px bg-border">
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('contacts.totalLent')}</p>
            <p className="text-xl sm:text-2xl font-mono tracking-tight font-medium text-foreground truncate">
              <AmountDisplay amount={totalLent} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('contacts.totalBorrowed')}</p>
            <p className="text-xl sm:text-2xl font-mono tracking-tight font-medium text-foreground truncate">
              <AmountDisplay amount={totalBorrowed} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('contacts.pendingReimbursement', '待報銷')}</p>
            <p className={cn("text-xl sm:text-2xl font-mono tracking-tight font-medium truncate", pendingReimbursement > 0 ? "text-amber-500" : "text-foreground")}>
              <AmountDisplay amount={pendingReimbursement} baseCurrency={activeLedger?.baseCurrency} type="neutral" />
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="flex border border-border rounded-lg overflow-hidden bg-card text-card-foreground divide-x divide-border shadow-none">
        <button 
          onClick={() => setIsEditDialogOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <Edit className="h-4 w-4 text-muted-foreground" />
          <span>{t('contacts.editContact', 'Edit Contact')}</span>
        </button>
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
        {pendingReimbursement > 0 && (
          <button 
            onClick={() => setIsSettleOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 text-sm font-medium hover:bg-muted/50 transition-colors text-amber-500 hover:text-amber-400 cursor-pointer"
          >
            <Receipt className="h-4 w-4 text-amber-500" />
            <span>{t('reimbursements.settleReimbursement', '結算回款')}</span>
          </button>
        )}
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
        <DialogContent className="sm:max-w-[350px] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-center">{t('contacts.editContact', 'Edit Contact')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium">{t('contacts.contactName')}</label>
              <Input 
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              />
            </div>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium">{t('contacts.category')}</label>
              <Select value={editGroup} onValueChange={(val) => { if (val) setEditGroup(val); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">{t('contacts.groupPersonal')}</SelectItem>
                  <SelectItem value="organization">{t('contacts.groupOrganization')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {deleteError && (
              <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-md">
                {deleteError}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 pt-4 border-t border-border">
              <Button variant="outline" className="w-full justify-center text-muted-foreground hover:text-foreground cursor-pointer" onClick={handleArchive}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                {t('contacts.archiveContact', 'Archive Contact')}
              </Button>
              <Button disabled={contactTransactions.length > 0} variant="outline" className="w-full justify-center text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('contacts.deleteContact', 'Delete Contact')}
              </Button>
            </div>
            
            {contactTransactions.length > 0 && (
              <div className="text-center !mt-3">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {t('contacts.cannotDeleteHasTransactions', 'Cannot delete contact with existing transactions. You can archive it instead.')}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
              {t('common.cancel', 'Cancel')}
            </DialogClose>
            <Button onClick={handleUpdate} disabled={!editName.trim()} className="cursor-pointer">
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      


      {/* Settle Reimbursement Dialog */}
      <SettleReimbursementDialog
        open={isSettleOpen}
        onOpenChange={setIsSettleOpen}
        target={contact && pendingTxs.length > 0 ? {
          contactId: contact.id,
          contactName: contact.name,
          transactions: pendingTxs,
          totalAmount: pendingReimbursement,
        } : null}
      />
    </div>
  );
}
