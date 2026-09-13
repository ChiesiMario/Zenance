import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Budget, type BudgetRule } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useTransactions } from './useTransactions';
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function getYearMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getMonthDateRange(yearMonthStr: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = yearMonthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonthStr}-01`,
    endDate: `${yearMonthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getYearDateRange(yearStr: string): { startDate: string; endDate: string } {
  return {
    startDate: `${yearStr}-01-01`,
    endDate: `${yearStr}-12-31`,
  };
}

// For backward compatibility: in the new decoupled architecture, budget.amount is the single truth
export function getEffectiveBudgetAmount(budget: Budget, _periodKey?: string): number {
  return budget.amount;
}

export function getBudgetDaysInfo(budget: Budget, today: Date = new Date()): {
  status: 'ongoing' | 'upcoming' | 'ended';
  days: number;
} {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const sDate = budget.startDate;
  const eDate = budget.endDate;

  if (eDate < todayStr) {
    const end = new Date(eDate);
    const diffTime = today.getTime() - end.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return { status: 'ended', days: Math.max(1, diffDays) };
  }

  if (sDate > todayStr) {
    const start = new Date(sDate);
    const diffTime = start.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { status: 'upcoming', days: Math.max(1, diffDays) };
  }

  // Ongoing
  const end = new Date(eDate);
  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  return { status: 'ongoing', days: diffDays };
}

export function useBudgets() {
  const { activeLedgerId } = useAppStore();

  // Query all non-deleted concrete budgets for active ledger
  const budgets = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Budget[]);
      return db.budgets.filter(b => !b.deleted && b.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  // Query all non-deleted recurring budget rules for active ledger
  const budgetRules = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as BudgetRule[]);
      return db.budget_rules.filter(r => !r.deleted && r.ledgerId === activeLedgerId).toArray();
    },
    [activeLedgerId]
  );

  const { transactions } = useTransactions();
  const isGeneratingRef = useRef(false);

  // Auto-generation & Catch-up Engine
  const generateDueBudgets = useCallback(async () => {
    if (!activeLedgerId || isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    try {
      const activeRules = await db.budget_rules
        .filter(r => !r.deleted && r.isActive && r.ledgerId === activeLedgerId)
        .toArray();

      const today = new Date();
      const currentMonthKey = getYearMonthString(today);
      const currentYearKey = String(today.getFullYear());

      for (const rule of activeRules) {
        if (rule.periodType === 'monthly') {
          // If already up-to-date with current month, skip
          if (rule.lastGeneratedPeriod && rule.lastGeneratedPeriod >= currentMonthKey) {
            continue;
          }

          const mKey = currentMonthKey;
          // Check if budget instance has EVER been generated for this rule and period (even if deleted)
          const existing = await db.budgets
            .filter(b => b.ruleId === rule.id && b.periodKey === mKey)
            .first();

          if (!existing) {
            const { startDate, endDate } = getMonthDateRange(mKey);
            await db.budgets.add({
              id: uuidv4(),
              ledgerId: rule.ledgerId,
              ruleId: rule.id,
              name: rule.name,
              amount: rule.amount,
              periodType: 'monthly',
              periodKey: mKey,
              startDate,
              endDate,
              categoryIds: rule.categoryIds || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deleted: false,
            });
          }

          await db.budget_rules.update(rule.id, {
            lastGeneratedPeriod: currentMonthKey,
            updatedAt: new Date().toISOString(),
          });
        } else if (rule.periodType === 'yearly') {
          // If already up-to-date with current year, skip
          if (rule.lastGeneratedPeriod && rule.lastGeneratedPeriod >= currentYearKey) {
            continue;
          }

          const yKey = currentYearKey;
          // Check if budget instance has EVER been generated for this rule and period (even if deleted)
          const existing = await db.budgets
            .filter(b => b.ruleId === rule.id && b.periodKey === yKey)
            .first();

          if (!existing) {
            const { startDate, endDate } = getYearDateRange(yKey);
            await db.budgets.add({
              id: uuidv4(),
              ledgerId: rule.ledgerId,
              ruleId: rule.id,
              name: rule.name,
              amount: rule.amount,
              periodType: 'yearly',
              periodKey: yKey,
              startDate,
              endDate,
              categoryIds: rule.categoryIds || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deleted: false,
            });
          }

          await db.budget_rules.update(rule.id, {
            lastGeneratedPeriod: currentYearKey,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('Failed to generate recurring budgets:', err);
    } finally {
      isGeneratingRef.current = false;
    }
  }, [activeLedgerId]);

  // Run auto-generation engine whenever active ledger changes
  useEffect(() => {
    generateDueBudgets();
  }, [generateDueBudgets]);

  // Helper to calculate spent for a budget in its date range
  const calculateSpent = useCallback(
    (budget: Budget, startDate: string, endDate: string): number => {
      if (!transactions) return 0;

      const categorySet = new Set(budget.categoryIds || []);
      let spent = 0;

      for (const tx of transactions) {
        if (tx.deleted) continue;

        // Explicitly excluded from all budgets
        if (tx.budgetId === 'none') continue;

        // Explicitly bound to this budget
        if (tx.budgetId === budget.id) {
          if (tx.type === 'expense') {
            spent += tx.amount;
          } else if (tx.type === 'income') {
            spent -= tx.amount;
          }
          continue;
        }

        // If explicitly bound to another budget, do not auto-match
        if (tx.budgetId && tx.budgetId !== 'auto') continue;

        // Auto-match for expenses: within date range and matching categories
        if (
          tx.type === 'expense' &&
          categorySet.size > 0 &&
          categorySet.has(tx.category) &&
          tx.date >= startDate &&
          tx.date <= endDate
        ) {
          spent += tx.amount;
        }
      }

      return Math.max(0, spent);
    },
    [transactions]
  );

  const getMonthlyBudgetSpent = useCallback(
    (budget: Budget, yearMonthStr: string): number => {
      const { startDate, endDate } = getMonthDateRange(yearMonthStr);
      return calculateSpent(budget, startDate, endDate);
    },
    [calculateSpent]
  );

  const getYearlyBudgetSpent = useCallback(
    (budget: Budget, yearStr: string): number => {
      const { startDate, endDate } = getYearDateRange(yearStr);
      return calculateSpent(budget, startDate, endDate);
    },
    [calculateSpent]
  );

  const getCustomBudgetSpent = useCallback(
    (budget: Budget): number => {
      if (!budget.startDate || !budget.endDate) return 0;
      return calculateSpent(budget, budget.startDate, budget.endDate);
    },
    [calculateSpent]
  );

  const getBudgetSpent = useCallback(
    (budget: Budget): number => {
      let sDate = budget.startDate;
      let eDate = budget.endDate;

      if (!sDate || !eDate) {
        if (budget.periodType === 'monthly' && budget.periodKey) {
          const range = getMonthDateRange(budget.periodKey);
          sDate = range.startDate;
          eDate = range.endDate;
        } else if (budget.periodType === 'yearly' && budget.periodKey) {
          const range = getYearDateRange(budget.periodKey);
          sDate = range.startDate;
          eDate = range.endDate;
        }
      }

      if (!sDate || !eDate) return 0;
      return calculateSpent(budget, sDate, eDate);
    },
    [calculateSpent]
  );

  // Filter concrete budgets active in a given month
  const isBudgetActiveInMonth = useCallback((budget: Budget, yearMonthStr: string): boolean => {
    if (budget.periodType === 'monthly') {
      return budget.periodKey === yearMonthStr;
    }
    if (budget.periodType === 'custom') {
      const { startDate, endDate } = getMonthDateRange(yearMonthStr);
      return (budget.startDate || '') <= endDate && (budget.endDate || '') >= startDate;
    }
    if (budget.periodType === 'yearly') {
      const yearStr = yearMonthStr.split('-')[0];
      return budget.periodKey === yearStr;
    }
    return false;
  }, []);

  // Filter concrete budgets active in a given year
  const isBudgetActiveInYear = useCallback((budget: Budget, yearStr: string): boolean => {
    if (budget.periodType === 'yearly') {
      return budget.periodKey === yearStr;
    }
    if (budget.periodType === 'monthly') {
      return (budget.periodKey || '').startsWith(`${yearStr}-`);
    }
    if (budget.periodType === 'custom') {
      return (budget.startDate || '') <= `${yearStr}-12-31` && (budget.endDate || '') >= `${yearStr}-01-01`;
    }
    return false;
  }, []);

  // Find up to `limit` active budgets for dashboard
  const getActiveBudgetsForMonth = useCallback(
    (targetMonth: Date, limit = 3): Array<{ budget: Budget; spent: number; effectiveAmount: number }> => {
      if (!budgets || budgets.length === 0) return [];

      const yearMonthStr = getYearMonthString(targetMonth);
      const targetMonthStart = `${yearMonthStr}-01`;
      const targetMonthEnd = getMonthDateRange(yearMonthStr).endDate;

      // 1. Monthly budgets for this month
      const activeMonthly = budgets
        .filter(b => b.periodType === 'monthly' && b.periodKey === yearMonthStr)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(b => ({
          budget: b,
          spent: getMonthlyBudgetSpent(b, yearMonthStr),
          effectiveAmount: b.amount,
        }));

      if (activeMonthly.length >= limit) {
        return activeMonthly.slice(0, limit);
      }

      // 2. Custom budgets crossing this month
      const activeCustom = budgets
        .filter(b => {
          if (b.periodType !== 'custom' && (b.periodType as string) !== undefined) return false;
          if (!b.startDate || !b.endDate) return false;
          return b.startDate <= targetMonthEnd && b.endDate >= targetMonthStart;
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(b => ({
          budget: b,
          spent: getCustomBudgetSpent(b),
          effectiveAmount: b.amount,
        }));

      const combined = [...activeMonthly, ...activeCustom];
      if (combined.length >= limit) {
        return combined.slice(0, limit);
      }

      // 3. Yearly budgets for this year
      const yearStr = String(targetMonth.getFullYear());
      const activeYearly = budgets
        .filter(b => b.periodType === 'yearly' && b.periodKey === yearStr)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(b => ({
          budget: b,
          spent: getYearlyBudgetSpent(b, yearStr),
          effectiveAmount: b.amount,
        }));

      return [...combined, ...activeYearly].slice(0, limit);
    },
    [budgets, getMonthlyBudgetSpent, getCustomBudgetSpent, getYearlyBudgetSpent]
  );

  // Budget Instance CRUD
  const addBudget = async (
    data: Omit<Budget, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>
  ): Promise<Budget> => {
    if (!activeLedgerId) throw new Error('No active ledger');
    const newBudget: Budget = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      ...data,
      categoryIds: data.categoryIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };
    await db.budgets.add(newBudget);
    return newBudget;
  };

  const updateBudget = async (
    id: string,
    data: Partial<Omit<Budget, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>>
  ) => {
    await db.budgets.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteBudget = async (id: string) => {
    await db.budgets.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  // Recurring Rule CRUD
  const addBudgetRule = async (
    data: Omit<BudgetRule, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted' | 'lastGeneratedPeriod'>
  ): Promise<BudgetRule> => {
    if (!activeLedgerId) throw new Error('No active ledger');
    const today = new Date();
    const currentPeriodKey = data.periodType === 'monthly' ? getYearMonthString(today) : String(today.getFullYear());

    const newRule: BudgetRule = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      ...data,
      isActive: true,
      lastGeneratedPeriod: currentPeriodKey,
      categoryIds: data.categoryIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };

    await db.budget_rules.add(newRule);

    // Immediately generate current period's concrete budget instance
    if (data.periodType === 'monthly') {
      const { startDate, endDate } = getMonthDateRange(currentPeriodKey);
      await db.budgets.add({
        id: uuidv4(),
        ledgerId: activeLedgerId,
        ruleId: newRule.id,
        name: newRule.name,
        amount: newRule.amount,
        periodType: 'monthly',
        periodKey: currentPeriodKey,
        startDate,
        endDate,
        categoryIds: newRule.categoryIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
      });
    } else {
      const { startDate, endDate } = getYearDateRange(currentPeriodKey);
      await db.budgets.add({
        id: uuidv4(),
        ledgerId: activeLedgerId,
        ruleId: newRule.id,
        name: newRule.name,
        amount: newRule.amount,
        periodType: 'yearly',
        periodKey: currentPeriodKey,
        startDate,
        endDate,
        categoryIds: newRule.categoryIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
      });
    }

    return newRule;
  };

  const updateBudgetRule = async (
    id: string,
    data: Partial<Omit<BudgetRule, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt' | 'deleted'>>
  ) => {
    await db.budget_rules.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleBudgetRuleActive = async (id: string, isActive: boolean) => {
    await db.budget_rules.update(id, {
      isActive,
      updatedAt: new Date().toISOString(),
    });

    if (isActive) {
      setTimeout(() => {
        generateDueBudgets();
      }, 0);
    }
  };

  const deleteBudgetRule = async (id: string) => {
    await db.budget_rules.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    budgets,
    budgetRules,
    getActiveBudgetsForMonth,
    getMonthlyBudgetSpent,
    getYearlyBudgetSpent,
    getCustomBudgetSpent,
    getBudgetSpent,
    getEffectiveBudgetAmount,
    isBudgetActiveInMonth,
    isBudgetActiveInYear,
    addBudget,
    updateBudget,
    deleteBudget,
    addBudgetRule,
    updateBudgetRule,
    toggleBudgetRuleActive,
    deleteBudgetRule,
    generateDueBudgets,
  };
}
