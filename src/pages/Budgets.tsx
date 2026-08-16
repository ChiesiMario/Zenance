import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBudgets } from '@/hooks/useBudgets';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus, Target } from 'lucide-react';
import { cn, getCurrencySymbol } from '@/lib/utils';

export default function Budgets() {
  const { t } = useTranslation();
  const { budgets, budgetProgress, addBudget } = useBudgets();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const currencySymbol = getCurrencySymbol(activeLedger?.baseCurrency || 'CNY');
  
  // Set default dates to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [newBudgetStart, setNewBudgetStart] = useState(firstDay);
  const [newBudgetEnd, setNewBudgetEnd] = useState(lastDay);

  const handleAddBudget = async () => {
    if (!newBudgetName.trim() || !newBudgetAmount) return;
    await addBudget({
      name: newBudgetName.trim(),
      amount: parseFloat(newBudgetAmount),
      startDate: newBudgetStart,
      endDate: newBudgetEnd,
    });
    setNewBudgetName('');
    setNewBudgetAmount('');
    setIsDialogOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t('budgets.budgets')}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" />}>
            <Plus className="h-5 w-5" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('budgets.addBudget')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <Input 
                placeholder={t('budgets.budgetName')} 
                value={newBudgetName}
                onChange={(e) => setNewBudgetName(e.target.value)}
                autoFocus
              />
              <Input 
                type="number"
                placeholder={t('budgets.targetAmount')} 
                value={newBudgetAmount}
                onChange={(e) => setNewBudgetAmount(e.target.value)}
              />
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">{t('budgets.startDate')}</span>
                  <Input 
                    type="date"
                    value={newBudgetStart}
                    onChange={(e) => setNewBudgetStart(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">{t('budgets.endDate')}</span>
                  <Input 
                    type="date"
                    value={newBudgetEnd}
                    onChange={(e) => setNewBudgetEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t('budgets.cancel')}
              </DialogClose>
              <Button onClick={handleAddBudget} disabled={!newBudgetName.trim() || !newBudgetAmount}>
                {t('budgets.add')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {budgets?.map(budget => {
          const spent = budgetProgress[budget.id] || 0;
          const percentage = Math.min(100, (spent / budget.amount) * 100);
          const isOver = spent > budget.amount;
          
          return (
            <div key={budget.id} className="border border-border rounded-xl p-5 bg-card text-card-foreground flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 text-muted/10 transition-transform group-hover:scale-110 duration-500">
                <Target className="h-32 w-32" />
              </div>
              
              <div className="relative z-10 space-y-2">
                <div className="flex justify-between items-baseline mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium leading-none">{budget.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className={cn("text-xl font-mono tracking-tight font-medium", isOver ? 'text-destructive' : 'text-foreground')}>
                      {currencySymbol}{spent.toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">
                      / {currencySymbol}{budget.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="h-2 w-full bg-muted overflow-hidden rounded-full">
                  <div 
                    className={cn("h-full transition-all duration-1000 ease-out", isOver ? "bg-destructive" : "bg-primary")}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-xs uppercase tracking-widest text-muted-foreground mt-1">
                  <span className="font-mono text-muted-foreground">{percentage.toFixed(0)}%</span>
                  <span>{t('budgets.remaining')} {currencySymbol}{(budget.amount - spent).toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
        {budgets?.length === 0 && (
          <div className="col-span-full p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
            No budgets found.
          </div>
        )}
      </div>
    </div>
  );
}
