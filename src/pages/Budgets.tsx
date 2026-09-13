import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useBudgets, getBudgetDaysInfo } from '@/hooks/useBudgets';
import { useCategories } from '@/hooks/useCategories';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Target,
  Pencil,
  Trash2,
  ChevronRight,
  Calendar,
  Check,
  Zap,
  Power,
  History,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { type Budget, type BudgetRule } from '@/services/db/db';

type BudgetsTab = 'ongoing' | 'rules';

export default function Budgets() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    budgets,
    budgetRules,
    getBudgetSpent,
    addBudget,
    updateBudget,
    deleteBudget,
    addBudgetRule,
    updateBudgetRule,
    toggleBudgetRuleActive,
    deleteBudgetRule,
  } = useBudgets();

  const { allCategories } = useCategories();
  const expenseCategories = useMemo(() => {
    return allCategories?.filter(c => c.type === 'expense') || [];
  }, [allCategories]);

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);

  // Active Tab State: ongoing | rules
  const queryTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<BudgetsTab>(
    queryTab === 'rules' ? 'rules' : 'ongoing'
  );

  useEffect(() => {
    if (queryTab === 'rules' && activeTab !== 'rules') {
      setActiveTab('rules');
    } else if (queryTab && queryTab !== 'rules' && activeTab !== 'ongoing') {
      setActiveTab('ongoing');
    }
  }, [queryTab, activeTab]);

  const handleTabChange = (val: string) => {
    const tab = val === 'rules' ? 'rules' : 'ongoing';
    setActiveTab(tab);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  // Unified Ongoing Budgets & Historical Count
  const { ongoingBudgets, historicalCount } = useMemo(() => {
    if (!budgets) return { ongoingBudgets: [], historicalCount: 0 };

    let historicalCount = 0;
    const ongoingList: Array<{
      budget: Budget;
      spent: number;
      effectiveAmount: number;
      daysInfo: ReturnType<typeof getBudgetDaysInfo>;
      isOver: boolean;
      percentage: number;
    }> = [];

    for (const b of budgets) {
      if (b.endDate && b.endDate < todayStr) {
        historicalCount++;
        continue;
      }

      const daysInfo = getBudgetDaysInfo(b, today);
      const spent = getBudgetSpent(b);
      const effectiveAmount = b.amount;
      const isOver = spent > effectiveAmount;
      const percentage = effectiveAmount > 0 ? Math.min(100, (spent / effectiveAmount) * 100) : 0;

      ongoingList.push({
        budget: b,
        spent,
        effectiveAmount,
        daysInfo,
        isOver,
        percentage,
      });
    }

    // Sort: Ongoing (status === 'ongoing') sorted by endDate ASC (soonest expiring first);
    // Upcoming (status === 'upcoming') sorted by startDate ASC placed after ongoing.
    ongoingList.sort((a, b) => {
      if (a.daysInfo.status === 'ongoing' && b.daysInfo.status === 'ongoing') {
        return (a.budget.endDate || '').localeCompare(b.budget.endDate || '');
      }
      if (a.daysInfo.status === 'ongoing' && b.daysInfo.status === 'upcoming') {
        return -1;
      }
      if (a.daysInfo.status === 'upcoming' && b.daysInfo.status === 'ongoing') {
        return 1;
      }
      return (a.budget.startDate || '').localeCompare(b.budget.startDate || '');
    });

    return { ongoingBudgets: ongoingList, historicalCount };
  }, [budgets, todayStr, today, getBudgetSpent]);

  // ----------------------------------------------------
  // Budget Modal States (Add / Edit Manual Fixed-Period Budget)
  // ----------------------------------------------------
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formBudgetName, setFormBudgetName] = useState('');
  const [formBudgetAmount, setFormBudgetAmount] = useState('');
  const [formBudgetStartDate, setFormBudgetStartDate] = useState('');
  const [formBudgetEndDate, setFormBudgetEndDate] = useState('');
  const [formBudgetCategoryIds, setFormBudgetCategoryIds] = useState<string[]>([]);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);

  const applyDatePreset = (preset: 'month' | 'year' | 'next30') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    if (preset === 'month') {
      const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setFormBudgetStartDate(first);
      setFormBudgetEndDate(last);
    } else if (preset === 'year') {
      setFormBudgetStartDate(`${y}-01-01`);
      setFormBudgetEndDate(`${y}-12-31`);
    } else if (preset === 'next30') {
      const start = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const end = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      setFormBudgetStartDate(start);
      setFormBudgetEndDate(end);
    }
  };

  const handleOpenAddBudget = () => {
    setEditingBudget(null);
    setFormBudgetName('');
    setFormBudgetAmount('');
    setFormBudgetCategoryIds([]);
    applyDatePreset('month');
    setIsBudgetModalOpen(true);
  };

  const handleOpenEditBudget = (b: Budget) => {
    setEditingBudget(b);
    setFormBudgetName(b.name);
    setFormBudgetAmount(String(b.amount));
    setFormBudgetStartDate(b.startDate || '');
    setFormBudgetEndDate(b.endDate || '');
    setFormBudgetCategoryIds(b.categoryIds || []);
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!formBudgetName.trim() || !formBudgetAmount || parseFloat(formBudgetAmount) <= 0) return;
    if (!formBudgetStartDate || !formBudgetEndDate || formBudgetStartDate > formBudgetEndDate) return;
    const amountNum = parseFloat(formBudgetAmount);

    if (editingBudget) {
      await updateBudget(editingBudget.id, {
        name: formBudgetName.trim(),
        amount: amountNum,
        startDate: formBudgetStartDate,
        endDate: formBudgetEndDate,
        categoryIds: formBudgetCategoryIds,
      });
    } else {
      await addBudget({
        name: formBudgetName.trim(),
        amount: amountNum,
        periodType: 'custom',
        startDate: formBudgetStartDate,
        endDate: formBudgetEndDate,
        categoryIds: formBudgetCategoryIds,
      });
    }

    setIsBudgetModalOpen(false);
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;
    await deleteBudget(budgetToDelete.id);
    setBudgetToDelete(null);
  };

  // ----------------------------------------------------
  // Recurring Rule Modal States (Add / Edit Rule)
  // ----------------------------------------------------
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BudgetRule | null>(null);
  const [formRuleName, setFormRuleName] = useState('');
  const [formRuleAmount, setFormRuleAmount] = useState('');
  const [formRulePeriodType, setFormRulePeriodType] = useState<'monthly' | 'yearly'>('monthly');
  const [formRuleCategoryIds, setFormRuleCategoryIds] = useState<string[]>([]);
  const [ruleToDelete, setRuleToDelete] = useState<BudgetRule | null>(null);

  const handleOpenAddRule = () => {
    setEditingRule(null);
    setFormRuleName('');
    setFormRuleAmount('');
    setFormRulePeriodType('monthly');
    setFormRuleCategoryIds([]);
    setIsRuleModalOpen(true);
  };

  const handleOpenEditRule = (r: BudgetRule) => {
    setEditingRule(r);
    setFormRuleName(r.name);
    setFormRuleAmount(String(r.amount));
    setFormRulePeriodType(r.periodType);
    setFormRuleCategoryIds(r.categoryIds || []);
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!formRuleName.trim() || !formRuleAmount || parseFloat(formRuleAmount) <= 0) return;
    const amountNum = parseFloat(formRuleAmount);

    if (editingRule) {
      await updateBudgetRule(editingRule.id, {
        name: formRuleName.trim(),
        amount: amountNum,
        periodType: formRulePeriodType,
        categoryIds: formRuleCategoryIds,
      });
    } else {
      await addBudgetRule({
        name: formRuleName.trim(),
        amount: amountNum,
        periodType: formRulePeriodType,
        categoryIds: formRuleCategoryIds,
        isActive: true,
      });
    }

    setIsRuleModalOpen(false);
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    await deleteBudgetRule(ruleToDelete.id);
    setRuleToDelete(null);
  };

  return (
    <div className="animate-in fade-in duration-500 w-full pb-20 p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('budgets.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('budgets.desc')}</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeTab === 'rules' ? (
            <Button onClick={handleOpenAddRule} size="sm" className="gap-1.5 cursor-pointer w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              <span>{t('budgets.addRule')}</span>
            </Button>
          ) : (
            <Button onClick={handleOpenAddBudget} size="sm" className="gap-1.5 cursor-pointer w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              <span>{t('budgets.add')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs: Ongoing vs Rules */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 w-full h-9">
          <TabsTrigger value="ongoing" className="text-xs sm:text-sm px-1 sm:px-2">
            {t('budgets.tabOngoing')}
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-1 sm:px-2">
            <Zap className="h-3.5 w-3.5 opacity-70" />
            <span>{t('budgets.tabRules')}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* -------------------------------------------------- */}
      {/* Ongoing Budgets List View                           */}
      {/* -------------------------------------------------- */}
      {activeTab === 'ongoing' && (
        <div className="space-y-4">
          {ongoingBudgets.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('budgets.noOngoingBudgets')}</p>
              <Button variant="outline" size="sm" onClick={handleOpenAddBudget} className="cursor-pointer">
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('budgets.add')}
              </Button>
            </div>
          ) : (
            ongoingBudgets.map(({ budget, spent, effectiveAmount, daysInfo, isOver, percentage }) => {
              const remaining = Math.max(0, effectiveAmount - spent);

              // Countdown text
              const countdownLabel =
                daysInfo.status === 'ongoing'
                  ? daysInfo.days === 0
                    ? t('budgets.dueToday')
                    : t('budgets.daysRemaining', { count: daysInfo.days })
                  : t('budgets.startsInDays', { count: daysInfo.days });

              return (
                <div
                  key={budget.id}
                  onClick={() => navigate(`/budgets/${budget.id}`)}
                  className="border border-border rounded-lg p-5 bg-card text-card-foreground flex flex-col justify-between relative overflow-hidden group transition-colors cursor-pointer hover:border-foreground/40"
                >
                  <div className="absolute -right-6 -top-6 text-muted/10 transition-transform group-hover:scale-110 duration-500 pointer-events-none">
                    <Target className="h-32 w-32" />
                  </div>

                  <div className="relative z-10 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold leading-none group-hover:text-primary transition-colors">
                            {budget.name}
                          </h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-muted/60 text-muted-foreground border-border flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 opacity-70" />
                            <span>{countdownLabel}</span>
                          </span>
                          {budget.ruleId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border bg-primary/10 text-primary border-primary/20">
                              {t('budgets.ruleBadge')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          {budget.startDate} ~ {budget.endDate}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            handleOpenEditBudget(budget);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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

                    <div className="flex justify-between items-center text-xs font-mono">
                      {isOver ? (
                        <span className="text-destructive font-semibold">
                          {t('budgets.overBudget')}: +
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
                            amount={remaining}
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

          {/* Bottom Entry Card to Historical Budgets */}
          <div
            onClick={() => navigate('/budgets/history')}
            className="border border-border border-dashed rounded-lg p-4 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between group mt-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md border border-border bg-background flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                <History className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-tight group-hover:text-foreground">
                  {t('budgets.viewHistory')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('budgets.historyBudgetCount', { count: historicalCount })}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* Recurring Rules Tab Content                         */}
      {/* -------------------------------------------------- */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {(!budgetRules || budgetRules.length === 0) ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('budgets.noRulesFound')}</p>
              <Button variant="outline" size="sm" onClick={handleOpenAddRule} className="cursor-pointer">
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('budgets.addRule')}
              </Button>
            </div>
          ) : (
            budgetRules.map(rule => {
              const ruleCategoryNames = allCategories
                ?.filter(c => rule.categoryIds?.includes(c.id))
                .map(c => c.name) || [];

              return (
                <div
                  key={rule.id}
                  className="border border-border rounded-lg p-5 bg-card text-card-foreground flex flex-col justify-between relative overflow-hidden group transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold leading-none">{rule.name}</h3>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest border',
                              rule.isActive
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-muted text-muted-foreground border-border'
                            )}
                          >
                            {rule.isActive ? t('budgets.ruleActive') : t('budgets.ruleInactive')}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                          {rule.periodType === 'monthly' ? t('budgets.cycleMonthly') : t('budgets.cycleYearly')}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-7 w-7 cursor-pointer',
                            rule.isActive ? 'text-primary hover:text-primary/80' : 'text-muted-foreground'
                          )}
                          onClick={() => toggleBudgetRuleActive(rule.id, !rule.isActive)}
                          title={rule.isActive ? t('budgets.ruleActive') : t('budgets.ruleInactive')}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => handleOpenEditRule(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                          onClick={() => setRuleToDelete(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t('budgets.ruleDefaultAmount')}
                      </span>
                      <AmountDisplay
                        amount={rule.amount}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="text-xl font-mono tracking-tight font-bold"
                      />
                    </div>

                    {/* Monitored Categories */}
                    <div className="pt-2 border-t border-border flex flex-wrap gap-1.5 items-center">
                      <span className="text-[11px] text-muted-foreground mr-1">
                        {t('budgets.monitoredCategories')}:
                      </span>
                      {ruleCategoryNames.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground/70">
                          {t('budgets.noCategoriesMonitored')}
                        </span>
                      ) : (
                        ruleCategoryNames.map((name, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-foreground font-medium"
                          >
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* Modal 1: Add / Edit Fixed-Period Budget Instance   */}
      {/* -------------------------------------------------- */}
      <Dialog open={isBudgetModalOpen} onOpenChange={setIsBudgetModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingBudget ? t('budgets.editBudget') : t('budgets.add')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.name')}
              </label>
              <Input
                placeholder={t('budgets.namePlaceholder')}
                value={formBudgetName}
                onChange={e => setFormBudgetName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.targetAmount')}
              </label>
              <Input
                type="number"
                placeholder={t('budgets.targetAmount')}
                value={formBudgetAmount}
                onChange={e => setFormBudgetAmount(e.target.value)}
              />
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.quickPresets')}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('month')}
                  className="text-xs h-7 px-2.5 cursor-pointer"
                >
                  {t('budgets.presetThisMonth')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('year')}
                  className="text-xs h-7 px-2.5 cursor-pointer"
                >
                  {t('budgets.presetThisYear')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('next30')}
                  className="text-xs h-7 px-2.5 cursor-pointer"
                >
                  {t('budgets.presetNext30Days')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('budgets.startDate')}</label>
                <Input
                  type="date"
                  value={formBudgetStartDate}
                  onChange={e => setFormBudgetStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('budgets.endDate')}</label>
                <Input
                  type="date"
                  value={formBudgetEndDate}
                  onChange={e => setFormBudgetEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Category Monitoring Selection */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('budgets.categories')}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {formBudgetCategoryIds.length === 0
                    ? t('budgets.noCategoriesSelected')
                    : t('budgets.categoriesSelected', { count: formBudgetCategoryIds.length })}
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 flex flex-wrap gap-1.5 bg-background">
                {expenseCategories.map(cat => {
                  const isSelected = formBudgetCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFormBudgetCategoryIds(prev =>
                          isSelected ? prev.filter(cId => cId !== cat.id) : [...prev, cat.id]
                        );
                      }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 cursor-pointer',
                        isSelected
                          ? 'bg-foreground text-background border-foreground font-medium'
                          : 'border-border bg-card text-card-foreground hover:bg-muted'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                {t('budgets.noCategoriesMonitored')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              onClick={handleSaveBudget}
              disabled={
                !formBudgetName.trim() ||
                !formBudgetAmount ||
                parseFloat(formBudgetAmount) <= 0 ||
                !formBudgetStartDate ||
                !formBudgetEndDate ||
                formBudgetStartDate > formBudgetEndDate
              }
            >
              {editingBudget ? t('budgets.save') : t('budgets.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- */}
      {/* Modal 2: Add / Edit Recurring Rule                 */}
      {/* -------------------------------------------------- */}
      <Dialog open={isRuleModalOpen} onOpenChange={setIsRuleModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('budgets.editRule') : t('budgets.addRule')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            {/* Rule Cycle Selection */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.ruleCycle')}
              </label>
              <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-1 bg-muted/40">
                <Button
                  type="button"
                  variant={formRulePeriodType === 'monthly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFormRulePeriodType('monthly')}
                  className="text-xs h-8 cursor-pointer"
                >
                  {t('budgets.cycleMonthly')}
                </Button>
                <Button
                  type="button"
                  variant={formRulePeriodType === 'yearly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFormRulePeriodType('yearly')}
                  className="text-xs h-8 cursor-pointer"
                >
                  {t('budgets.cycleYearly')}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.name')}
              </label>
              <Input
                placeholder={t('budgets.namePlaceholder')}
                value={formRuleName}
                onChange={e => setFormRuleName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.ruleDefaultAmount')}
              </label>
              <Input
                type="number"
                placeholder={t('budgets.ruleDefaultAmount')}
                value={formRuleAmount}
                onChange={e => setFormRuleAmount(e.target.value)}
              />
            </div>

            {/* Category Monitoring Selection */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('budgets.categories')}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {formRuleCategoryIds.length === 0
                    ? t('budgets.noCategoriesSelected')
                    : t('budgets.categoriesSelected', { count: formRuleCategoryIds.length })}
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 flex flex-wrap gap-1.5 bg-background">
                {expenseCategories.map(cat => {
                  const isSelected = formRuleCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFormRuleCategoryIds(prev =>
                          isSelected ? prev.filter(cId => cId !== cat.id) : [...prev, cat.id]
                        );
                      }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 cursor-pointer',
                        isSelected
                          ? 'bg-foreground text-background border-foreground font-medium'
                          : 'border-border bg-card text-card-foreground hover:bg-muted'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                {t('budgets.noCategoriesMonitored')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              onClick={handleSaveRule}
              disabled={!formRuleName.trim() || !formRuleAmount || parseFloat(formRuleAmount) <= 0}
            >
              {editingRule ? t('budgets.save') : t('budgets.addRule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- */}
      {/* Modal 3: Delete Budget Instance Confirmation       */}
      {/* -------------------------------------------------- */}
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

      {/* -------------------------------------------------- */}
      {/* Modal 4: Delete Rule Confirmation                  */}
      {/* -------------------------------------------------- */}
      <Dialog open={!!ruleToDelete} onOpenChange={open => !open && setRuleToDelete(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.deleteRule')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground">{t('budgets.deleteRuleConfirm')}</p>
            {ruleToDelete && (
              <p className="text-sm font-semibold font-mono bg-muted p-2 rounded border border-border">
                {ruleToDelete.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setRuleToDelete(null)}>
              {t('budgets.cancel')}
            </Button>
            <Button variant="destructive" type="button" onClick={handleDeleteRule}>
              {t('budgets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
