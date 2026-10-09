import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/AmountInput';
import { DatePicker } from '@/components/ui/date-picker';
import { BudgetCategoryPicker } from '@/components/budgets/BudgetCategoryPicker';
import { useBudgets } from '@/hooks/useBudgets';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/components/ui/toast';
import { PieChart, Infinity as InfinityIcon } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/utils';
import type { Budget } from '@/services/db/db';

export interface BudgetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'create' | 'edit';
  budget?: Budget | null;
  onSuccess?: (budget?: Budget) => void;
}

export function BudgetFormDialog({
  open,
  onOpenChange,
  mode,
  budget,
  onSuccess,
}: BudgetFormDialogProps) {
  const { t } = useTranslation();
  const { addBudget, updateBudget } = useBudgets();
  const { allCategories } = useCategories();
  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find(l => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';
  const currencySymbol = useMemo(() => getCurrencySymbol(baseCurrency), [baseCurrency]);

  const expenseCategories = useMemo(() => {
    return allCategories?.filter(c => c.type === 'expense') || [];
  }, [allCategories]);

  const isEdit = mode === 'edit' || (Boolean(budget) && mode !== 'create');

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [activePreset, setActivePreset] = useState<'month' | 'year' | 'next30' | 'unlimited' | null>('month');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEditDates = !isEdit || budget?.periodType === 'custom' || budget?.periodType === 'unlimited';

  const applyDatePreset = (preset: 'month' | 'year' | 'next30' | 'unlimited') => {
    setActivePreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    if (preset === 'unlimited') {
      setIsUnlimited(true);
      const start = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      setStartDate(start);
      setEndDate('');
    } else if (preset === 'month') {
      setIsUnlimited(false);
      const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setStartDate(first);
      setEndDate(last);
    } else if (preset === 'year') {
      setIsUnlimited(false);
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    } else if (preset === 'next30') {
      setIsUnlimited(false);
      const start = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const end = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      setStartDate(start);
      setEndDate(end);
    }
  };

  useEffect(() => {
    if (!open) return;

    if (isEdit && budget) {
      setName(budget.name);
      setAmount(String(budget.amount));
      setStartDate(budget.startDate || '');
      setEndDate(budget.endDate || '');
      const unlimited = budget.periodType === 'unlimited' || !budget.endDate;
      setIsUnlimited(unlimited);
      setCategoryIds(budget.categoryIds || []);
      setActivePreset(unlimited ? 'unlimited' : null);
    } else {
      setName('');
      setAmount('');
      setCategoryIds([]);
      applyDatePreset('month');
    }
  }, [open, budget, isEdit]);

  const handleToggleUnlimited = (checked: boolean) => {
    setIsUnlimited(checked);
    if (checked) {
      setActivePreset('unlimited');
      setEndDate('');
    } else {
      setActivePreset(null);
      if (!endDate) {
        applyDatePreset('month');
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !amount || parseFloat(amount) <= 0) return;
    if (canEditDates) {
      if (!startDate) return;
      if (!isUnlimited && (!endDate || startDate > endDate)) return;
    }

    const amountNum = parseFloat(amount);
    setIsSubmitting(true);

    try {
      if (isEdit && budget) {
        const isCustomOrUnlimited = budget.periodType === 'custom' || budget.periodType === 'unlimited';
        const targetPeriodType = isCustomOrUnlimited
          ? (isUnlimited ? 'unlimited' : 'custom')
          : budget.periodType;

        await updateBudget(budget.id, {
          name: name.trim(),
          amount: amountNum,
          periodType: targetPeriodType,
          startDate: canEditDates ? startDate : budget.startDate,
          endDate: canEditDates ? (isUnlimited ? '' : endDate) : budget.endDate,
          categoryIds,
        });
        toast.show(t('common.saved', '已保存'));
        onSuccess?.(budget);
      } else {
        await addBudget({
          name: name.trim(),
          amount: amountNum,
          periodType: isUnlimited ? 'unlimited' : 'custom',
          startDate,
          endDate: isUnlimited ? '' : endDate,
          categoryIds,
          isEnded: false,
        });
        toast.show(t('budgets.addSuccess', '預算新增成功'));
        onSuccess?.();
      }
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save budget:', err);
      toast.show(t('common.error', '操作失敗'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    name.trim().length > 0 &&
    amount.length > 0 &&
    parseFloat(amount) > 0 &&
    (!canEditDates ||
      (Boolean(startDate) &&
        (isUnlimited || (Boolean(endDate) && startDate <= endDate))));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PieChart className="size-5 text-primary" />
            <span>{isEdit ? t('budgets.editBudget') : t('budgets.addBudget')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
          {/* Budget Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('budgets.name')}
            </label>
            <Input
              placeholder={t('budgets.namePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Target Amount */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('budgets.targetAmount')}
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-mono font-medium text-muted-foreground pointer-events-none select-none">
                {currencySymbol}
              </span>
              <AmountInput
                placeholder="0.00"
                value={amount}
                onValueChange={setAmount}
                currencySymbol={currencySymbol}
                style={{
                  paddingLeft: `${Math.max(2.2, 0.75 + currencySymbol.length * 0.6)}rem`,
                }}
              />
            </div>
          </div>

          {/* Quick Presets & Date Range */}
          {canEditDates && (
            <>
              {/* Quick Presets */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('budgets.quickPresets')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    type="button"
                    variant={activePreset === 'month' && !isUnlimited ? 'default' : 'outline'}
                    onClick={() => applyDatePreset('month')}
                    className="h-10 px-3 text-xs cursor-pointer font-medium"
                  >
                    {t('budgets.presetThisMonth')}
                  </Button>
                  <Button
                    type="button"
                    variant={activePreset === 'year' && !isUnlimited ? 'default' : 'outline'}
                    onClick={() => applyDatePreset('year')}
                    className="h-10 px-3 text-xs cursor-pointer font-medium"
                  >
                    {t('budgets.presetThisYear')}
                  </Button>
                  <Button
                    type="button"
                    variant={activePreset === 'next30' && !isUnlimited ? 'default' : 'outline'}
                    onClick={() => applyDatePreset('next30')}
                    className="h-10 px-3 text-xs cursor-pointer font-medium"
                  >
                    {t('budgets.presetNext30Days')}
                  </Button>
                  <Button
                    type="button"
                    variant={isUnlimited ? 'default' : 'outline'}
                    onClick={() => applyDatePreset('unlimited')}
                    className="h-10 px-3 text-xs cursor-pointer flex items-center gap-1.5 font-medium"
                  >
                    <InfinityIcon className="size-3.5" />
                    <span>{t('budgets.presetUnlimited')}</span>
                  </Button>
                </div>
              </div>

              {/* Start & End Date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('budgets.startDate')}
                  </label>
                  <DatePicker
                    value={startDate}
                    onChange={val => {
                      setStartDate(val);
                      if (activePreset !== 'unlimited') setActivePreset(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('budgets.endDate')}
                  </label>
                  {isUnlimited ? (
                    <button
                      type="button"
                      onClick={() => handleToggleUnlimited(false)}
                      className="w-full h-10 px-3 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center justify-between text-sm font-mono transition-colors cursor-pointer select-none"
                    >
                      <span className="italic">{t('budgets.manualEnd')}</span>
                      <InfinityIcon className="size-4 opacity-60" />
                    </button>
                  ) : (
                    <DatePicker
                      value={endDate}
                      onChange={val => {
                        setEndDate(val);
                        setIsUnlimited(false);
                        setActivePreset(null);
                      }}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Category Monitoring Selection */}
          <BudgetCategoryPicker
            selectedCategoryIds={categoryIds}
            onChange={setCategoryIds}
            expenseCategories={expenseCategories}
          />
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-3 sm:gap-3">
          <DialogClose render={<Button variant="ghost" type="button" />}>
            {t('budgets.cancel')}
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={!isFormValid || isSubmitting}
            className="cursor-pointer"
          >
            {isEdit ? t('common.save', '保存') : t('budgets.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
