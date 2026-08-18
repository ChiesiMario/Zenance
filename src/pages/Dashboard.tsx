import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useBudgets } from '@/hooks/useBudgets';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Settings, ChevronDown, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { Link } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { type Ledger } from '@/services/db/db';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_CURRENCIES } from '@/hooks/useExchangeRates';

export default function Dashboard() {
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { activeBudget, budgetProgress } = useBudgets();
  const { ledgers, addLedger, updateLedger, deleteLedger } = useLedgers();
  const { activeLedgerId, setActiveLedgerId } = useAppStore();
  const { t, i18n } = useTranslation();

  const [isManageLedgersOpen, setIsManageLedgersOpen] = useState(false);
  const [isCreateLedgerOpen, setIsCreateLedgerOpen] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerCurrency, setNewLedgerCurrency] = useState('CNY');
  
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [editingLedgerName, setEditingLedgerName] = useState('');
  
  const [ledgerToDelete, setLedgerToDelete] = useState<Ledger | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');

  // Initialize active ledger if null
  useEffect(() => {
    if (!activeLedgerId && ledgers && ledgers.length > 0) {
      // Find default ledger or first ledger
      const defaultLedger = ledgers.find(l => l.isDefault) || ledgers[0];
      setActiveLedgerId(defaultLedger.id);
    }
  }, [ledgers, activeLedgerId, setActiveLedgerId]);

  const handleAddLedger = async () => {
    if (!newLedgerName.trim()) return;
    const newLedger = await addLedger(newLedgerName.trim(), newLedgerCurrency);
    setActiveLedgerId(newLedger.id);
    setNewLedgerName('');
    setIsCreateLedgerOpen(false);
  };

  const handleUpdateLedgerName = async (id: string) => {
    if (editingLedgerName.trim()) {
      await updateLedger(id, { name: editingLedgerName.trim() });
    }
    setEditingLedgerId(null);
  };

  const handleDeleteLedger = async () => {
    if (!ledgerToDelete || deleteConfirmationName !== ledgerToDelete.name) return;
    await deleteLedger(ledgerToDelete.id);
    
    // Switch to another ledger if active one is deleted
    if (activeLedgerId === ledgerToDelete.id && ledgers && ledgers.length > 1) {
      const anotherLedger = ledgers.find(l => l.id !== ledgerToDelete.id);
      if (anotherLedger) setActiveLedgerId(anotherLedger.id);
    }
    
    setLedgerToDelete(null);
    setDeleteConfirmationName('');
  };

  const currentMonthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  
  const filteredTransactions = useMemo(() => {
    return transactions?.filter(t => t.date.startsWith(currentMonthPrefix)) || [];
  }, [transactions, currentMonthPrefix]);

  const { income, expense, balance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    });
    return { income: inc, expense: exp, balance: inc - exp };
  }, [filteredTransactions]);

  const formatMonth = (date: Date) => {
    const isCurrentYear = date.getFullYear() === new Date().getFullYear();
    let str = date.toLocaleDateString(i18n.language, {
      year: isCurrentYear ? undefined : 'numeric',
      month: 'long'
    });
    
    // Apply Pangu spacing for Chinese mixed with numbers
    if (i18n.language.startsWith('zh')) {
      str = str.replace(/([0-9a-zA-Z])([一-龥])/g, '$1 $2').replace(/([一-龥])([0-9a-zA-Z])/g, '$1 $2');
    }
    
    return str;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const getCategoryName = (id: string) => {
    if (id === 'transfer') return t('add.transfer');
    return categories?.find(c => c.id === id)?.name || id;
  };
  
  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      <div className="flex items-center justify-between gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center text-xl font-semibold tracking-tight hover:bg-muted/50 data-[state=open]:bg-muted/50 rounded-md px-2 -ml-2 py-1 outline-none min-w-0 max-w-[250px]">
            <span className="truncate">
              {activeLedger?.name || t('dashboard.overview')}
            </span>
            <ChevronDown className="ml-1 h-4 w-4 opacity-50 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-[200px] max-w-[calc(100vw-2rem)]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="bg-foreground text-background text-sm text-center !px-3 !py-2.5 rounded-t-[7px] -mx-2 -mt-2 mb-1 font-semibold">{t('dashboard.switchLedger')}</DropdownMenuLabel>
              {ledgers?.map(ledger => (
                <DropdownMenuItem 
                  key={ledger.id}
                  onClick={() => setActiveLedgerId(ledger.id)}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 mr-2">
                    <span className="truncate block">{ledger.name}</span>
                    <span className="text-[10px] font-mono uppercase tracking-widest bg-foreground !text-background px-1.5 py-0.5 rounded-sm shrink-0">{ledger.baseCurrency || 'CNY'}</span>
                  </div>
                  {ledger.id === activeLedgerId && <span className="text-[10px] uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm shrink-0">Active</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsCreateLedgerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.createLedger')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsManageLedgersOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              {t('dashboard.manageLedgers')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={isManageLedgersOpen} onOpenChange={setIsManageLedgersOpen}>
          <DialogContent className="sm:max-w-[350px]">
            <DialogHeader>
              <DialogTitle>{t('dashboard.manageLedgers')}</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-6">
              
              <div className="space-y-3">
                <div className="border border-border rounded-md divide-y divide-border">
                  {ledgers?.map(ledger => (
                    <div key={ledger.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 min-h-12 md:min-h-10 items-center px-4 md:px-3 py-2 text-sm hover:bg-muted/30 transition-colors w-full">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {editingLedgerId === ledger.id ? (
                          <Input
                            value={editingLedgerName}
                            onChange={(e) => setEditingLedgerName(e.target.value)}
                            onBlur={() => handleUpdateLedgerName(ledger.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateLedgerName(ledger.id)}
                            className="h-7 w-32 px-2 text-sm shrink-0"
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium truncate block">{ledger.name}</span>
                        )}
                        <span className="text-[10px] font-mono uppercase tracking-widest bg-foreground !text-background px-1.5 py-0.5 rounded-sm shrink-0">{ledger.baseCurrency || 'CNY'}</span>
                        {ledger.id === activeLedgerId && <span className="text-[10px] uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm shrink-0">Active</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingLedgerId(ledger.id);
                            setEditingLedgerName(ledger.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground" 
                          disabled={(ledgers?.length || 0) <= 1}
                          onClick={() => {
                            setLedgerToDelete(ledger);
                            setDeleteConfirmationName('');
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
            <DialogFooter className="flex-row justify-between items-center sm:justify-between">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => {
                  setIsCreateLedgerOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('ledgers.add')}
              </Button>
              <DialogClose render={<Button variant="default" type="button" />}>
                {t('common.confirm')}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCreateLedgerOpen} onOpenChange={setIsCreateLedgerOpen}>
          <DialogContent className="sm:max-w-[300px] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-center">{t('dashboard.createLedger')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('ledgers.ledgerName')}</label>
                <Input 
                  placeholder={t('dashboard.newLedgerName')} 
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLedger()}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">{t('ledgers.baseCurrency')}</label>
                <Select value={newLedgerCurrency} onValueChange={(val) => { if (val) setNewLedgerCurrency(val); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t('ledgers.cancel')}
              </DialogClose>
              <Button 
                onClick={handleAddLedger} 
                disabled={!newLedgerName.trim()}
              >
                {t('ledgers.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!ledgerToDelete} onOpenChange={(open) => !open && setLedgerToDelete(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('ledgers.deleteLedger')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('ledgers.deleteWarning')}
                <br /><br />
                {t('ledgers.typeToConfirm')} <span className="font-mono text-foreground font-semibold">{ledgerToDelete?.name}</span>
              </p>
              <Input 
                placeholder={t('ledgers.ledgerName')} 
                value={deleteConfirmationName}
                onChange={(e) => setDeleteConfirmationName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t('ledgers.cancel')}
              </DialogClose>
              <Button 
                variant="destructive" 
                onClick={handleDeleteLedger} 
                disabled={deleteConfirmationName !== ledgerToDelete?.name}
              >
                {t('ledgers.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Link to="/settings" className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <Settings className="size-5" strokeWidth={1.5} />
        </Link>
      </div>
      
      {/* Top Overview Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        
        {/* Month Selector */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
          <Button variant="ghost" onClick={handlePrevMonth} className="!size-8 !p-0 text-muted-foreground hover:text-foreground rounded-md">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm capitalize">{formatMonth(currentMonth)}</span>
          <Button variant="ghost" onClick={handleNextMonth} className="!size-8 !p-0 text-muted-foreground hover:text-foreground rounded-md">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Top Summary row */}
        <div className="p-6 border-b border-border flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('dashboard.netBalance')}</p>
          <p className="text-4xl font-mono tracking-tighter font-medium text-foreground">
            {currencySymbol}{balance.toLocaleString()}
          </p>
        </div>

        {/* Split Metrics */}
        <div className="grid grid-cols-2 gap-px bg-border">
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.income')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium">{currencySymbol}{income.toLocaleString()}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t('dashboard.expense')}</p>
            <p className="text-2xl font-mono tracking-tight font-medium">{currencySymbol}{expense.toLocaleString()}</p>
          </div>
        </div>

        {/* Overview Row: Active Budget */}
        {activeBudget && (
          <div className="border-t border-border p-4 bg-card">
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground">{activeBudget.name}</h2>
              <div className="text-right">
                <span className="text-lg font-mono font-medium text-foreground">
                  {currencySymbol}{(budgetProgress[activeBudget.id] || 0).toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">/ {currencySymbol}{activeBudget.amount.toLocaleString()}</span>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
              <div 
                className={cn("h-full transition-all duration-1000 ease-out", (budgetProgress[activeBudget.id] || 0) > activeBudget.amount ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(100, ((budgetProgress[activeBudget.id] || 0) / activeBudget.amount) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Recent Transactions List Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-4 border-b border-border bg-muted/20">
          <h3 className="text-sm font-medium">{t('dashboard.activity')}</h3>
        </div>
        
        <div className="divide-y divide-border">
          {filteredTransactions.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noActivity')}
            </div>
          )}
          
          {filteredTransactions.slice(0, 15).map((tx) => (
            <button 
              key={tx.id} 
              onClick={() => setSelectedTransactionId(tx.id)}
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">{getCategoryName(tx.category)}</span>
                <p className="text-sm text-muted-foreground truncate">
                  {tx.type === 'transfer' ? t('add.transfer') : tx.type === 'loan' ? t('add.loan') : categories?.find(c => c.id === tx.category)?.name || tx.category}
                  {tx.note && ` · ${tx.note}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-base font-mono font-medium ${tx.type === 'income' ? 'text-primary' : (tx.type === 'transfer' || tx.type === 'loan') ? 'text-blue-500' : 'text-muted-foreground'}`}>
                  {tx.type === 'expense' ? '-' : (tx.type === 'transfer' || tx.type === 'loan') ? '' : '+'}{currencySymbol}{tx.amount.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <TransactionDetailsDialog 
        transactionId={selectedTransactionId} 
        onClose={() => setSelectedTransactionId(null)} 
      />
    </div>
  );
}
