import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Calendar,
  Trash2,
  TrendingDown,
  TrendingUp,
  Archive,
  Zap,
} from 'lucide-react';
import { useBudgets, formatBudgetDisplayRange } from '@/hooks/useBudgets';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { cn } from '@/lib/utils';
import { type Budget } from '@/services/db/db';

export default function BudgetHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);

  const { budgets, getBudgetSpent, deleteBudget } = useBudgets();
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  // Filter historical budgets (isEnded or endDate < today) and sort descending by endDate
  const historyBudgets = useMemo(() => {
    if (!budgets) return [];
    return budgets
      .filter(b => b.isEnded || (b.endDate && b.endDate < todayStr))
      .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))
      .map(b => {
        const spent = getBudgetSpent(b);
        const effectiveAmount = b.amount;
        const isOver = spent > effectiveAmount;
        const percentage = effectiveAmount > 0 ? Math.min(100, (spent / effectiveAmount) * 100) : 0;
        return {
          budget: b,
          spent,
          effectiveAmount,
          isOver,
          percentage,
        };
      });
  }, [budgets, todayStr, getBudgetSpent]);

  // Overall Statistics
  const stats = useMemo(() => {
    let totalSpent = 0;
    let totalBudget = 0;
    let underCount = 0;
    let overCount = 0;

    for (const item of historyBudgets) {
      totalSpent += item.spent;
      totalBudget += item.effectiveAmount;
      if (item.isOver) {
        overCount++;
      } else {
        underCount++;
      }
    }

    return { totalSpent, totalBudget, underCount, overCount };
  }, [historyBudgets]);

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;
    await deleteBudget(budgetToDelete.id);
    setBudgetToDelete(null);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      {/* Header & Back Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/budgets')}
          className="h-9 w-9 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg border border-border"
          aria-label={t('budgets.backToBudgets')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('budgets.historyTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('budgets.historyDesc')}</p>
        </div>
      </div>

      {/* Summary Statistics Card */}
      {historyBudgets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-card border border-border rounded-lg p-4">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('budgets.historyTotalSpent')}
            </span>
            <div>
              <AmountDisplay
                amount={stats.totalSpent}
                baseCurrency={activeLedger?.baseCurrency}
                type="neutral"
                className="text-lg font-mono font-bold tracking-tight text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('budgets.historyTotalBudget')}
            </span>
            <div>
              <AmountDisplay
                amount={stats.totalBudget}
                baseCurrency={activeLedger?.baseCurrency}
                type="neutral"
                className="text-lg font-mono font-bold tracking-tight text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-primary" />
              {t('budgets.historyUnderCount')}
            </span>
            <p className="text-lg font-mono font-bold tracking-tight text-foreground">
              {stats.underCount}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-destructive" />
              {t('budgets.historyOverCount')}
            </span>
            <p className="text-lg font-mono font-bold tracking-tight text-destructive">
              {stats.overCount}
            </p>
          </div>
        </div>
      )}

      {/* Historical Budgets List */}
      <div className="space-y-3">
        {historyBudgets.length === 0 ? (
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
            <Archive className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p>{t('budgets.noHistoryBudgets')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/budgets')}
              className="cursor-pointer"
            >
              {t('budgets.backToBudgets')}
            </Button>
          </div>
        ) : (
          historyBudgets.map(({ budget, spent, effectiveAmount, isOver, percentage }) => {
            return (
              <div
                key={budget.id}
                onClick={() => navigate(`/budgets/${budget.id}`)}
                className="border border-border rounded-lg p-5 bg-card text-card-foreground flex flex-col justify-between relative overflow-hidden group transition-colors cursor-pointer hover:border-foreground/40"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold leading-none group-hover:text-primary transition-colors">
                          {budget.name}
                        </h3>
                        {budget.ruleId && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-muted/60 text-muted-foreground border-border">
                            <Zap className="h-2.5 w-2.5 opacity-70" />
                            <span>{t('budgets.ruleBadge')}</span>
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border',
                            isOver
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : 'bg-muted text-muted-foreground border-border'
                          )}
                        >
                          {isOver ? t('budgets.settledOver') : t('budgets.settledUnder')}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 opacity-60" />
                        <span>
                          {formatBudgetDisplayRange(budget.startDate, budget.endDate, {
                            isEnded: budget.isEnded,
                            endedAt: budget.endedAt,
                            language: i18n.language,
                            t,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={e => {
                          e.stopPropagation();
                          setBudgetToDelete(budget);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {t('budgets.spent')}
                    </span>
                    <div className="text-right">
                      <AmountDisplay
                        amount={spent}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className={cn(
                          'text-xl font-mono tracking-tight font-medium',
                          isOver ? 'text-destructive' : 'text-foreground'
                        )}
                      />
                      <span className="text-sm text-muted-foreground ml-1">
                        /{' '}
                        <AmountDisplay
                          amount={effectiveAmount}
                          baseCurrency={activeLedger?.baseCurrency}
                          type="neutral"
                        />
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full transition-all duration-700 ease-out',
                        isOver ? 'bg-destructive' : 'bg-primary'
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {/* Remaining / Over Details */}
                  <div className="flex justify-between items-center text-xs font-mono">
                    {isOver ? (
                      <span className="text-destructive font-semibold">
                        {t('budgets.overBudget')}:{' '}
                        <AmountDisplay
                          amount={spent - effectiveAmount}
                          baseCurrency={activeLedger?.baseCurrency}
                          type="neutral"
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('budgets.remaining')}:{' '}
                        <AmountDisplay
                          amount={Math.max(0, effectiveAmount - spent)}
                          baseCurrency={activeLedger?.baseCurrency}
                          type="neutral"
                        />
                      </span>
                    )}
                    <span className="text-muted-foreground font-mono">{percentage.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!budgetToDelete} onOpenChange={open => !open && setBudgetToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.deleteBudget')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground">{t('budgets.deleteBudgetConfirm')}</p>
            {budgetToDelete && (
              <p className="text-sm font-semibold font-mono bg-muted p-2 rounded border border-border">
                {budgetToDelete.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setBudgetToDelete(null)}>
              {t('budgets.cancel')}
            </Button>
            <Button variant="destructive" type="button" onClick={handleDeleteBudget}>
              {t('budgets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
