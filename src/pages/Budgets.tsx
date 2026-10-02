import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useBudgets, getBudgetDaysInfo, formatBudgetDisplayRange } from '@/hooks/useBudgets';
import { useCategories } from '@/hooks/useCategories';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/AmountInput';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Check,
  Zap,
  Power,
  Clock,
  ChevronDown,
  ChevronRight,
  Archive,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { BudgetProgressBar } from '@/components/budgets/BudgetProgressBar';
import { type Budget, type BudgetRule } from '@/services/db/db';

export default function Budgets() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    budgets,
    budgetRules,
    getBudgetSpent,
    addBudget,
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

  // Active Tab & Filter State derived directly from URL searchParams
  const queryTab = searchParams.get('tab');
  const activeSection: 'budgets' | 'rules' = queryTab === 'rules' ? 'rules' : 'budgets';

  // Retain the last selected budget filter ('ongoing' | 'ended') even when viewing 'rules'
  const [lastBudgetFilter, setLastBudgetFilter] = useState<'ongoing' | 'ended'>('ongoing');

  useEffect(() => {
    if (queryTab === 'ended') {
      setLastBudgetFilter('ended');
    } else if (queryTab !== 'rules') {
      setLastBudgetFilter('ongoing');
    }
  }, [queryTab]);

  const currentBudgetFilter: 'ongoing' | 'ended' =
    queryTab === 'ended' ? 'ended' : queryTab === 'rules' ? lastBudgetFilter : 'ongoing';

  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);

  const handleBudgetFilterChange = (filter: 'ongoing' | 'ended') => {
    setLastBudgetFilter(filter);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (filter === 'ended') {
          next.set('tab', 'ended');
        } else {
          next.delete('tab');
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleSectionChange = (val: string) => {
    if (val === 'rules') {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('tab', 'rules');
          return next;
        },
        { replace: true }
      );
    } else {
      // Switching from 'rules' back to 'budgets'
      // Switch directly to whichever filter is currently displayed on the tab (What you see is what you get)
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (lastBudgetFilter === 'ended') {
            next.set('tab', 'ended');
          } else {
            next.delete('tab');
          }
          return next;
        },
        { replace: true }
      );
    }
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;
    await deleteBudget(budgetToDelete.id);
    setBudgetToDelete(null);
  };

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  // Unified Ongoing Budgets
  const ongoingBudgets = useMemo(() => {
    if (!budgets) return [];

    const ongoingList: Array<{
      budget: Budget;
      spent: number;
      effectiveAmount: number;
      daysInfo: ReturnType<typeof getBudgetDaysInfo>;
      isOver: boolean;
      percentage: number;
    }> = [];

    for (const b of budgets) {
      if (b.isEnded || (b.endDate && b.endDate < todayStr)) {
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
    // Unlimited ongoing sorted by startDate DESC; Upcoming sorted by startDate ASC placed after ongoing.
    ongoingList.sort((a, b) => {
      if (a.daysInfo.status === 'ongoing' && b.daysInfo.status === 'ongoing') {
        return (a.budget.endDate || '').localeCompare(b.budget.endDate || '');
      }
      if ((a.daysInfo.status === 'ongoing' || a.daysInfo.status === 'unlimited') && b.daysInfo.status === 'upcoming') {
        return -1;
      }
      if (a.daysInfo.status === 'upcoming' && (b.daysInfo.status === 'ongoing' || b.daysInfo.status === 'unlimited')) {
        return 1;
      }
      if (a.daysInfo.status === 'unlimited' && b.daysInfo.status === 'unlimited') {
        return (b.budget.startDate || '').localeCompare(a.budget.startDate || '');
      }
      if (a.daysInfo.status === 'ongoing' && b.daysInfo.status === 'unlimited') {
        return -1;
      }
      if (a.daysInfo.status === 'unlimited' && b.daysInfo.status === 'ongoing') {
        return 1;
      }
      return (a.budget.startDate || '').localeCompare(b.budget.startDate || '');
    });

    return ongoingList;
  }, [budgets, todayStr, today, getBudgetSpent]);

  // Unified Ended Budgets (sorted descending by endedAt / endDate)
  const endedBudgets = useMemo(() => {
    if (!budgets) return [];
    return budgets
      .filter(b => b.isEnded || (b.endDate && b.endDate < todayStr))
      .sort((a, b) => {
        const aDate = a.endedAt || a.endDate || a.startDate || '';
        const bDate = b.endedAt || b.endDate || b.startDate || '';
        return bDate.localeCompare(aDate);
      })
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

  // ----------------------------------------------------
  // Budget Modal States (Add Manual Budget)
  // ----------------------------------------------------
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [formBudgetName, setFormBudgetName] = useState('');
  const [formBudgetAmount, setFormBudgetAmount] = useState('');
  const [formBudgetStartDate, setFormBudgetStartDate] = useState('');
  const [formBudgetEndDate, setFormBudgetEndDate] = useState('');
  const [formBudgetCategoryIds, setFormBudgetCategoryIds] = useState<string[]>([]);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [activePreset, setActivePreset] = useState<'month' | 'year' | 'next30' | 'unlimited' | null>('month');

  const applyDatePreset = (preset: 'month' | 'year' | 'next30' | 'unlimited') => {
    setActivePreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    if (preset === 'unlimited') {
      setIsUnlimited(true);
      const start = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      setFormBudgetStartDate(start);
      setFormBudgetEndDate('');
    } else if (preset === 'month') {
      setIsUnlimited(false);
      const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setFormBudgetStartDate(first);
      setFormBudgetEndDate(last);
    } else if (preset === 'year') {
      setIsUnlimited(false);
      setFormBudgetStartDate(`${y}-01-01`);
      setFormBudgetEndDate(`${y}-12-31`);
    } else if (preset === 'next30') {
      setIsUnlimited(false);
      const start = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const end = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      setFormBudgetStartDate(start);
      setFormBudgetEndDate(end);
    }
  };

  const handleOpenAddBudget = () => {
    setFormBudgetName('');
    setFormBudgetAmount('');
    setFormBudgetCategoryIds([]);
    setIsUnlimited(false);
    applyDatePreset('month');
    setIsBudgetModalOpen(true);
  };

  const handleToggleUnlimited = (checked: boolean) => {
    setIsUnlimited(checked);
    if (checked) {
      setActivePreset('unlimited');
      setFormBudgetEndDate('');
    } else {
      setActivePreset(null);
      if (!formBudgetEndDate) {
        applyDatePreset('month');
      }
    }
  };

  const handleSaveBudget = async () => {
    if (!formBudgetName.trim() || !formBudgetAmount || parseFloat(formBudgetAmount) <= 0) return;
    if (!formBudgetStartDate) return;
    if (!isUnlimited && (!formBudgetEndDate || formBudgetStartDate > formBudgetEndDate)) return;
    const amountNum = parseFloat(formBudgetAmount);

    await addBudget({
      name: formBudgetName.trim(),
      amount: amountNum,
      periodType: isUnlimited ? 'unlimited' : 'custom',
      startDate: formBudgetStartDate,
      endDate: isUnlimited ? '' : formBudgetEndDate,
      categoryIds: formBudgetCategoryIds,
      isEnded: false,
    });

    setIsBudgetModalOpen(false);
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
    <div className="animate-in fade-in duration-500 w-full">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between h-8 mb-2">
        <h2 className="text-xl font-semibold tracking-tight leading-none">{t('budgets.title')}</h2>

        <div className="h-8 w-8 flex items-center justify-center">
          {!(activeSection === 'budgets' && currentBudgetFilter === 'ended') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={activeSection === 'rules' ? handleOpenAddRule : handleOpenAddBudget}
              title={activeSection === 'rules' ? t('budgets.addRule') : t('budgets.add')}
              aria-label={activeSection === 'rules' ? t('budgets.addRule') : t('budgets.add')}
            >
              <Plus className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Segmented Control: Budgets (Dropdown) vs Rules */}
        <SegmentedControl
        value={activeSection}
        onChange={handleSectionChange}
        fullWidth
        options={[
          {
            value: 'budgets',
            icon:
              currentBudgetFilter === 'ended' ? (
                <Archive className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              ),
            label: (
              <span className="flex items-center gap-1">
                <span>
                  {currentBudgetFilter === 'ended'
                    ? t('budgets.tabEnded')
                    : t('budgets.tabOngoing')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </span>
            ),
            dropdown: (
              <DropdownMenuContent align="start" sideOffset={6} className="min-w-[130px]">
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleBudgetFilterChange('ongoing')}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('budgets.tabOngoing')}</span>
                  </span>
                  {currentBudgetFilter === 'ongoing' && activeSection === 'budgets' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleBudgetFilterChange('ended')}
                >
                  <span className="flex items-center gap-2">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('budgets.tabEnded')}</span>
                  </span>
                  {currentBudgetFilter === 'ended' && activeSection === 'budgets' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            ),
          },
          {
            value: 'rules',
            label: t('budgets.tabRules'),
            icon: <Zap className="h-3.5 w-3.5" />,
          },
        ]}
      />

      {/* -------------------------------------------------- */}
      {/* Ongoing Budgets List View                           */}
      {/* -------------------------------------------------- */}
      {activeSection === 'budgets' && currentBudgetFilter === 'ongoing' && (
        <div key="ongoing" className="space-y-4">
          {budgets === undefined ? (
            <div className="min-h-[200px]" />
          ) : ongoingBudgets.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('budgets.noOngoingBudgets')}</p>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenAddBudget}
                className="cursor-pointer mx-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                title={t('budgets.add')}
                aria-label={t('budgets.add')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            ongoingBudgets.map(({ budget, spent, effectiveAmount, daysInfo, isOver, percentage }) => {
              const remaining = Math.max(0, effectiveAmount - spent);

              // Date Range text
              const dateRangeLabel = formatBudgetDisplayRange(budget.startDate, budget.endDate, {
                isEnded: budget.isEnded,
                endedAt: budget.endedAt,
                language: i18n.language,
                t,
              });

              // Countdown text
              const countdownLabel =
                daysInfo.status === 'unlimited'
                  ? t('budgets.unlimitedPeriod', '無期限')
                  : daysInfo.status === 'ongoing'
                    ? daysInfo.days === 0
                      ? t('budgets.dueToday', '今日到期')
                      : `剩 ${daysInfo.days} 天`
                    : t('budgets.startsInDays', { count: daysInfo.days, defaultValue: `${daysInfo.days} 天後開始` });

              const showDaily = !isOver && daysInfo.status === 'ongoing' && daysInfo.days > 0;

              return (
                <div
                  key={budget.id}
                  onClick={() => navigate(`/budgets/${budget.id}`)}
                  className={cn(
                    'border rounded-lg p-4 bg-card text-card-foreground transition-all cursor-pointer group space-y-3',
                    isOver
                      ? 'border-destructive/30 hover:border-destructive/50'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  {/* Top Line: Title + Subtitle | Remaining Amount */}
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="space-y-0.5 truncate">
                      <h3
                        className={cn(
                          'text-sm font-semibold tracking-tight transition-colors truncate',
                          isOver ? 'text-destructive' : 'text-foreground group-hover:text-primary'
                        )}
                      >
                        {budget.name}
                      </h3>
                      <p
                        className={cn(
                          'text-[11px] font-mono',
                          isOver ? 'text-destructive/80' : 'text-muted-foreground'
                        )}
                      >
                        {dateRangeLabel}
                        {countdownLabel ? ` · ${countdownLabel}` : ''}
                        {showDaily && (
                          <>
                            {' · 每日 '}
                            <AmountDisplay
                              amount={Math.round(remaining / daysInfo.days)}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="neutral"
                              className="font-normal"
                            />
                          </>
                        )}
                      </p>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div
                        className={cn(
                          'text-base font-semibold tracking-tight',
                          isOver ? 'text-destructive' : 'text-foreground'
                        )}
                      >
                        {isOver ? (
                          <>
                            {t('budgets.overBudget', '超支')}{' '}
                            <AmountDisplay
                              amount={spent - effectiveAmount}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="neutral"
                            />
                          </>
                        ) : (
                          <>
                            {t('budgets.remaining', '剩餘')}{' '}
                            <AmountDisplay
                              amount={remaining}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="neutral"
                            />
                          </>
                        )}
                      </div>
                      <div
                        className={cn(
                          'text-[11px]',
                          isOver ? 'text-destructive/80' : 'text-muted-foreground'
                        )}
                      >
                        {percentage.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <BudgetProgressBar
                    budgetKey={budget.id}
                    percentage={percentage}
                    isOver={isOver}
                    variant="foreground"
                  />

                  {/* Bottom Line: Spent / Budget | Chevron */}
                  <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
                    <span>
                      {t('budgets.spent', '已支出')}{' '}
                      <AmountDisplay
                        amount={spent}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="font-normal"
                      />
                      {' / '}
                      <AmountDisplay
                        amount={effectiveAmount}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="font-normal"
                      />
                    </span>
                    <ChevronRight
                      className={cn(
                        'size-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all',
                        isOver ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* Ended Budgets List View                             */}
      {/* -------------------------------------------------- */}
      {activeSection === 'budgets' && currentBudgetFilter === 'ended' && (
        <div key="ended" className="space-y-4">
          {budgets === undefined ? (
            <div className="min-h-[200px]" />
          ) : endedBudgets.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Archive className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('budgets.noEndedBudgets')}</p>
            </div>
          ) : (
            endedBudgets.map(({ budget, spent, effectiveAmount, isOver, percentage }) => {
              return (
                <div
                  key={budget.id}
                  onClick={() => navigate(`/budgets/${budget.id}`)}
                  className={cn(
                    'border rounded-lg p-4 bg-card text-card-foreground transition-all cursor-pointer group space-y-3',
                    isOver
                      ? 'border-destructive/30 hover:border-destructive/50'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="space-y-0.5 truncate">
                      <h3
                        className={cn(
                          'text-sm font-semibold tracking-tight transition-colors truncate',
                          isOver ? 'text-destructive' : 'text-foreground group-hover:text-primary'
                        )}
                      >
                        {budget.name}
                      </h3>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {formatBudgetDisplayRange(budget.startDate, budget.endDate, {
                          isEnded: budget.isEnded,
                          endedAt: budget.endedAt,
                          language: i18n.language,
                          t,
                        })}
                        {' · '}
                        {t('budgets.tabEnded', '已結束')}
                      </p>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div
                        className={cn(
                          'text-base font-semibold tracking-tight',
                          isOver ? 'text-destructive' : 'text-foreground'
                        )}
                      >
                        {isOver ? (
                          <>
                            {t('budgets.overBudget', '超支')}{' '}
                            <AmountDisplay
                              amount={spent - effectiveAmount}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="neutral"
                            />
                          </>
                        ) : (
                          <>
                            {t('budgets.saved', '結餘')}{' '}
                            <AmountDisplay
                              amount={effectiveAmount - spent}
                              baseCurrency={activeLedger?.baseCurrency}
                              type="neutral"
                            />
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {percentage.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  <BudgetProgressBar
                    budgetKey={budget.id}
                    percentage={percentage}
                    isOver={isOver}
                    variant="muted"
                  />

                  <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
                    <span>
                      {t('budgets.spent', '已支出')}{' '}
                      <AmountDisplay
                        amount={spent}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="font-normal"
                      />
                      {' / '}
                      <AmountDisplay
                        amount={effectiveAmount}
                        baseCurrency={activeLedger?.baseCurrency}
                        type="neutral"
                        className="font-normal"
                      />
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer -mr-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBudgetToDelete(budget);
                      }}
                      title={t('budgets.deleteBudget')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* Recurring Rules Tab Content                         */}
      {/* -------------------------------------------------- */}
      {activeSection === 'rules' && (
        <div key="rules" className="space-y-4">
          {budgetRules === undefined ? (
            <div className="min-h-[200px]" />
          ) : (!budgetRules || budgetRules.length === 0) ? (
            <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card space-y-3">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>{t('budgets.noRulesFound')}</p>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenAddRule}
                className="cursor-pointer mx-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                title={t('budgets.addRule')}
                aria-label={t('budgets.addRule')}
              >
                <Plus className="h-4 w-4" />
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
                  className="border border-border rounded-lg p-4 bg-card text-card-foreground transition-all space-y-3"
                >
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="space-y-0.5 truncate">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2 rounded-full shrink-0',
                            rule.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                          )}
                        />
                        <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                          {rule.name}
                        </h3>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground pl-4">
                        {rule.periodType === 'monthly' ? t('budgets.cycleMonthly', '每月週期') : t('budgets.cycleYearly', '年度週期')}
                        {ruleCategoryNames.length > 0 && ` · ${ruleCategoryNames.join(', ')}`}
                      </p>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div className="text-base font-semibold tracking-tight text-foreground">
                        <AmountDisplay
                          amount={rule.amount}
                          baseCurrency={activeLedger?.baseCurrency}
                          type="neutral"
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {rule.isActive ? t('budgets.ruleActive', '運行中') : t('budgets.ruleInactive', '已暫停')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs font-mono text-muted-foreground">
                    <span>
                      {rule.periodType === 'monthly'
                        ? t('budgets.monthlyRuleDesc', '每月 1 號自動生成')
                        : t('budgets.yearlyRuleDesc', '每年 1 號自動生成')}
                    </span>
                    <div className="flex items-center gap-1 -mr-1">
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
                        title={t('common.edit', '編輯')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => setRuleToDelete(rule)}
                        title={t('common.delete', '刪除')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>{t('budgets.addBudget')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.name')}
              </label>
              <Input
                placeholder={t('budgets.namePlaceholder')}
                value={formBudgetName}
                onChange={e => setFormBudgetName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.targetAmount')}
              </label>
              <AmountInput
                placeholder={t('budgets.targetAmount')}
                value={formBudgetAmount}
                onValueChange={setFormBudgetAmount}
              />
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.quickPresets')}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('month')}
                  className={cn(
                    "text-xs h-7 px-2.5 cursor-pointer",
                    activePreset === 'month' && !isUnlimited && "bg-foreground text-background border-foreground font-medium"
                  )}
                >
                  {t('budgets.presetThisMonth')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('year')}
                  className={cn(
                    "text-xs h-7 px-2.5 cursor-pointer",
                    activePreset === 'year' && !isUnlimited && "bg-foreground text-background border-foreground font-medium"
                  )}
                >
                  {t('budgets.presetThisYear')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('next30')}
                  className={cn(
                    "text-xs h-7 px-2.5 cursor-pointer",
                    activePreset === 'next30' && !isUnlimited && "bg-foreground text-background border-foreground font-medium"
                  )}
                >
                  {t('budgets.presetNext30Days')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyDatePreset('unlimited')}
                  className={cn(
                    "text-xs h-7 px-2.5 cursor-pointer flex items-center gap-1",
                    isUnlimited && "bg-foreground text-background border-foreground font-medium"
                  )}
                >
                  <InfinityIcon className="size-3" />
                  <span>{t('budgets.presetUnlimited')}</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('budgets.startDate')}</label>
                <DatePicker
                  value={formBudgetStartDate}
                  onChange={val => {
                    setFormBudgetStartDate(val);
                    if (activePreset !== 'unlimited') setActivePreset(null);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('budgets.endDate')}</label>
                  <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                    <input
                      type="checkbox"
                      checked={isUnlimited}
                      onChange={e => handleToggleUnlimited(e.target.checked)}
                      className="rounded border-border size-3 cursor-pointer"
                    />
                    <span>{t('budgets.noEndDate')}</span>
                  </label>
                </div>
                {isUnlimited ? (
                  <div className="h-9 px-3 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground flex items-center justify-between text-xs font-mono select-none">
                    <span className="italic">{t('budgets.manualEnd')}</span>
                    <InfinityIcon className="size-3.5 opacity-60" />
                  </div>
                ) : (
                  <DatePicker
                    value={formBudgetEndDate}
                    onChange={val => {
                      setFormBudgetEndDate(val);
                      setIsUnlimited(false);
                      setActivePreset(null);
                    }}
                  />
                )}
              </div>
            </div>

            {/* Category Monitoring Selection */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                {t('budgets.categoriesHint', '勾選分類後，相關支出將自動納入預算；未設定亦可於記帳時手動指定。')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              onClick={handleSaveBudget}
              disabled={
                !formBudgetName.trim() ||
                !formBudgetAmount ||
                parseFloat(formBudgetAmount) <= 0 ||
                !formBudgetStartDate ||
                (!isUnlimited && (!formBudgetEndDate || formBudgetStartDate > formBudgetEndDate))
              }
              className="cursor-pointer"
            >
              {t('budgets.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- */}
      {/* Modal 2: Add / Edit Recurring Rule                 */}
      {/* -------------------------------------------------- */}
      <Dialog open={isRuleModalOpen} onOpenChange={setIsRuleModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('budgets.editRule') : t('budgets.addRule')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto pr-1">
            {/* Rule Cycle Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
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

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.name')}
              </label>
              <Input
                placeholder={t('budgets.namePlaceholder')}
                value={formRuleName}
                onChange={e => setFormRuleName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('budgets.ruleDefaultAmount')}
              </label>
              <AmountInput
                placeholder={t('budgets.ruleDefaultAmount')}
                value={formRuleAmount}
                onValueChange={setFormRuleAmount}
              />
            </div>

            {/* Category Monitoring Selection */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                {t('budgets.categoriesHint', '勾選分類後，相關支出將自動納入預算；未設定亦可於記帳時手動指定。')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button" />}>
              {t('budgets.cancel')}
            </DialogClose>
            <Button
              onClick={handleSaveRule}
              disabled={!formRuleName.trim() || !formRuleAmount || parseFloat(formRuleAmount) <= 0}
              className="cursor-pointer"
            >
              {editingRule ? t('budgets.save') : t('budgets.addRule')}
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

      {/* -------------------------------------------------- */}
      {/* Modal 5: Delete Budget Confirmation (Ended Budget) */}
      {/* -------------------------------------------------- */}
      <Dialog open={!!budgetToDelete} onOpenChange={open => !open && setBudgetToDelete(null)}>
        <DialogContent className="sm:max-w-[420px]">
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
    </div>
  );
}
