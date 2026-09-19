import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { 
  Delete, 
  CalendarDays, 
  Check, 
  Equal, 
  Target, 
  ChevronDown, 
  Sparkles, 
  Receipt, 
  Users,
  Ban
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { toast } from '@/components/ui/toast';
import { SplitAdvanceDialog, type SplitItem } from './SplitAdvanceDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Budget, Account } from '@/services/db/db';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  date: string;
  onDateChange: (date: string) => void;
  type?: 'expense' | 'income' | 'transfer' | 'loan';
  budgetId?: string;
  onBudgetChange?: (budgetId: string) => void;
  budgets?: Budget[];
  reimbursementContactId?: string;
  onReimbursementContactChange?: (contactId: string | undefined) => void;
  splits?: SplitItem[];
  onSplitsChange?: (splits: SplitItem[]) => void;
  currencySymbol?: string;
  contacts?: Account[];
}

const safeEvaluate = (expr: string): string => {
  try {
    // Only allow numbers and basic math operators
    if (!/^[0-9+\-*/.\s]+$/.test(expr)) return expr;
    // Prevent trailing operators before eval
    if (/[+\-*/.]$/.test(expr)) return expr;
    // eslint-disable-next-line no-new-func
    const result = new Function('return ' + expr)();
    if (typeof result === 'number' && !isNaN(result)) {
      // Format to avoid long decimals
      return parseFloat(result.toFixed(4)).toString();
    }
  } catch (e) {
    // ignore
  }
  return expr;
};

export function NumericKeypad({
  value,
  onChange,
  onSubmit,
  date,
  onDateChange,
  type = 'expense',
  budgetId,
  onBudgetChange,
  budgets = [],
  reimbursementContactId,
  onReimbursementContactChange,
  splits,
  onSplitsChange,
  currencySymbol = '¥',
  contacts = [],
}: Props) {
  const { t } = useTranslation();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false);

  const isExpression = useMemo(() => {
    return /[+\-*/]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value);
  }, [value]);

  const handleKeyPress = (key: string) => {
    if (key === 'C') {
      onChange('');
      return;
    }
    
    if (key === 'DEL') {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === '=') {
      if (isExpression) {
        onChange(safeEvaluate(value));
      } else {
        onSubmit();
      }
      return;
    }

    const operators = ['+', '-', '*', '/'];
    
    // Prevent multiple operators in a row
    if (operators.includes(key) && operators.includes(value.slice(-1))) {
      onChange(value.slice(0, -1) + key);
      return;
    }
    
    // Prevent starting with an operator (except minus)
    if (value === '' && operators.includes(key) && key !== '-') {
      return;
    }

    onChange(value + key);
  };

  const today = new Date().toISOString().split('T')[0];
  const dateDisplay = date === today ? t('add.today', 'Today') : date.slice(5); // e.g. 08-18

  // Show budget selector for expense and income
  const showBudgetButton = (type === 'expense' || type === 'income') && Boolean(onBudgetChange);

  // Show reimbursement selector only for expense
  const showReimburseButton = type === 'expense' && Boolean(onReimbursementContactChange);

  // Match current selected budget
  const matchingBudget = useMemo(() => {
    if (!budgetId || budgetId === 'auto' || budgetId === 'none') return null;
    return budgets?.find(b => b.id === budgetId) || null;
  }, [budgets, budgetId]);

  // Label to display on the budget button
  const budgetDisplayLabel = useMemo(() => {
    if (matchingBudget) {
      return matchingBudget.name;
    }
    if (type === 'income') {
      return budgetId && budgetId !== 'none' ? t('add.budget', '預算') : t('add.budgetNone', '不計入預算');
    }
    if (budgetId === 'none') {
      return t('add.budgetNone', '不計入預算');
    }
    return t('add.budgetAuto', '預算：自動');
  }, [matchingBudget, type, budgetId, t]);

  // 當前代付/分攤清單
  const currentSplits = useMemo(() => {
    if (splits && splits.length > 0) return splits;
    if (reimbursementContactId) {
      const amt = parseFloat(safeEvaluate(value)) || 0;
      return [{ contactId: reimbursementContactId, amount: amt }];
    }
    return [];
  }, [splits, reimbursementContactId, value]);

  const isSplitActive = currentSplits.length > 0;

  // 按鈕呈現的標籤
  const reimburseDisplayLabel = useMemo(() => {
    if (currentSplits.length === 0) {
      return t('add.reimburse', '代付');
    }
    if (currentSplits.length === 1) {
      const contact = contacts?.find(c => c.id === currentSplits[0].contactId);
      return contact?.name || t('add.reimburse', '代付');
    }
    return t('add.splitCount', { count: currentSplits.length, defaultValue: `分攤（${currentSplits.length} 人）` });
  }, [currentSplits, contacts, t]);

  // Available budgets filtered by selected transaction date (fallback to ongoing)
  const availableBudgets = useMemo(() => {
    if (!budgets || budgets.length === 0) return [];
    
    // Filter active budgets covering the selected date
    const coveringDate = budgets.filter(b => {
      if (b.deleted) return false;
      const startMatch = !b.startDate || b.startDate <= date;
      const endMatch = !b.endDate || b.endDate >= date;
      return startMatch && endMatch;
    });

    if (coveringDate.length > 0) {
      return coveringDate;
    }

    // Fallback: ongoing budgets
    const todayStr = new Date().toISOString().split('T')[0];
    const ongoing = budgets.filter(b => !b.deleted && (!b.endDate || b.endDate >= todayStr));
    if (ongoing.length > 0) {
      return ongoing;
    }

    return budgets.filter(b => !b.deleted);
  }, [budgets, date]);

  return (
    <div className="grid grid-cols-4 gap-2 w-full mx-auto max-w-[350px] h-64">
      
      {/* Row 1: Action Buttons (Date, Budget, Reimbursement) */}
      <div className={cn(
        "col-span-4 w-full h-full",
        showReimburseButton ? "grid grid-cols-3 gap-1.5" : (showBudgetButton ? "grid grid-cols-2 gap-2" : "")
      )}>
        
        {/* Button 1: Date Picker */}
        <div className="relative w-full h-full">
          <button 
            type="button" 
            className="w-full h-full flex gap-1.5 items-center justify-center p-0 rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer" 
            onClick={() => setIsCalendarOpen(true)}
          >
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="text-xs uppercase tracking-wider font-medium truncate max-w-[80px]">{dateDisplay}</span>
          </button>

          {isCalendarOpen && typeof document !== 'undefined' && (
            createPortal(
              <div className="fixed inset-0 z-[100] flex items-center justify-center isolate">
                {/* Full-screen Backdrop */}
                <div 
                  className="absolute inset-0 bg-background/40 backdrop-blur-md transition-opacity duration-200 animate-in fade-in-0" 
                  onClick={() => setIsCalendarOpen(false)}
                  aria-hidden="true" 
                />
                
                {/* Calendar Popup */}
                <div className="relative z-10 w-auto p-3 flex flex-col items-center justify-center rounded-xl bg-background border border-border shadow-none animate-in zoom-in-95 duration-200">
                  <Calendar
                    selected={parseISO(date)}
                    onSelect={(d: Date) => {
                      onDateChange(format(d, 'yyyy-MM-dd'));
                      setIsCalendarOpen(false);
                    }}
                  />
                </div>
              </div>,
              document.body
            )
          )}
        </div>

        {/* Button 2: Budget Selector */}
        {showBudgetButton && (
          <div className="relative w-full h-full">
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className={cn(
                  "w-full h-full flex gap-1 items-center justify-center px-1.5 py-0 rounded-xl transition-colors outline-none cursor-pointer group border",
                  matchingBudget
                    ? "bg-white/10 text-white border-white/20"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border-transparent"
                )}
              >
                <Target className="size-3.5 shrink-0 text-zinc-400 group-hover:text-white transition-colors" />
                <span className="text-xs uppercase tracking-wider font-medium truncate max-w-[65px]">
                  {budgetDisplayLabel}
                </span>
                <ChevronDown className="size-3 opacity-60 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" sideOffset={8} className="w-56 max-h-64 overflow-y-auto">
                {type === 'expense' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onBudgetChange?.('auto')}
                      className="flex items-center justify-between cursor-pointer py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="size-4 text-zinc-400 shrink-0" />
                        <div className="flex flex-col text-left">
                          <span className="font-medium text-xs">{t('add.budgetAutoFull', '自動匹配')}</span>
                          <span className="text-[10px] text-muted-foreground">{t('add.budgetAutoDesc', '依分類與日期自動計算')}</span>
                        </div>
                      </div>
                      {(!budgetId || budgetId === 'auto') && <Check className="size-4 shrink-0 text-foreground" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => onBudgetChange?.('none')}
                      className="flex items-center justify-between cursor-pointer py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Ban className="size-4 text-zinc-400 shrink-0" />
                        <span className="font-medium text-xs">{t('add.budgetNone', '不計入預算')}</span>
                      </div>
                      {budgetId === 'none' && <Check className="size-4 shrink-0 text-foreground" />}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
                        {t('add.budgetPlan', '預算計劃')}
                      </DropdownMenuLabel>

                      {availableBudgets.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                          {t('add.noBudgetsAvailable', '無可用預算')}
                        </div>
                      ) : (
                        availableBudgets.map(b => {
                          const isSelected = budgetId === b.id;
                          return (
                            <DropdownMenuItem
                              key={b.id}
                              onClick={() => onBudgetChange?.(b.id)}
                              className="flex items-center justify-between cursor-pointer py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Target className="size-4 text-zinc-400 shrink-0" />
                                <div className="flex flex-col text-left min-w-0">
                                  <span className="font-medium text-xs truncate max-w-[140px]">{b.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {b.startDate} ~ {b.endDate}
                                  </span>
                                </div>
                              </div>
                              {isSelected && <Check className="size-4 shrink-0 text-foreground" />}
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </DropdownMenuGroup>
                  </>
                )}

                {type === 'income' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onBudgetChange?.('none')}
                      className="flex items-center justify-between cursor-pointer py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Ban className="size-4 text-zinc-400 shrink-0" />
                        <span className="font-medium text-xs">{t('add.budgetNone', '不計入預算')}</span>
                      </div>
                      {(!budgetId || budgetId === 'none') && <Check className="size-4 shrink-0 text-foreground" />}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
                        {t('add.budgetOffset', '沖抵預算')}
                      </DropdownMenuLabel>

                      {availableBudgets.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                          {t('add.noBudgetsAvailable', '無可用預算')}
                        </div>
                      ) : (
                        availableBudgets.map(b => {
                          const isSelected = budgetId === b.id;
                          return (
                            <DropdownMenuItem
                              key={b.id}
                              onClick={() => onBudgetChange?.(b.id)}
                              className="flex items-center justify-between cursor-pointer py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Target className="size-4 text-zinc-400 shrink-0" />
                                <div className="flex flex-col text-left min-w-0">
                                  <span className="font-medium text-xs truncate max-w-[140px]">{b.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {b.startDate} ~ {b.endDate}
                                  </span>
                                </div>
                              </div>
                              {isSelected && <Check className="size-4 shrink-0 text-foreground" />}
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Button 3: Reimbursement / Split Selector */}
        {showReimburseButton && (() => {
          const currentTotalAmount = parseFloat(safeEvaluate(value)) || 0;
          const isAmountValid = currentTotalAmount > 0;

          return (
            <div className="relative w-full h-full">
              <button
                type="button"
                onClick={() => {
                  if (!isAmountValid) {
                    toast.show(t('alerts.enterAmountFirstForAdvance'));
                    return;
                  }
                  setIsSplitDialogOpen(true);
                }}
                className={cn(
                  "w-full h-full flex gap-1 items-center justify-center px-1.5 py-0 rounded-xl transition-all outline-none border",
                  !isAmountValid
                    ? "bg-white/5 text-zinc-500 opacity-40 cursor-not-allowed border-transparent"
                    : isSplitActive
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 cursor-pointer"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white border-transparent cursor-pointer"
                )}
              >
                {currentSplits.length > 1 ? (
                  <Users className={cn("size-3.5 shrink-0", !isAmountValid ? "text-zinc-500" : "text-amber-400")} />
                ) : (
                  <Receipt className={cn("size-3.5 shrink-0 transition-colors", !isAmountValid ? "text-zinc-500" : isSplitActive ? "text-amber-400" : "text-zinc-400 group-hover:text-white")} />
                )}
                <span className="text-xs uppercase tracking-wider font-medium truncate max-w-[65px]">
                  {reimburseDisplayLabel}
                </span>
                <ChevronDown className="size-3 opacity-60 shrink-0" />
              </button>

              <SplitAdvanceDialog
                open={isSplitDialogOpen}
                onOpenChange={setIsSplitDialogOpen}
                totalAmount={currentTotalAmount}
                currencySymbol={currencySymbol}
                splits={currentSplits}
                onConfirm={(newSplits) => {
                  onSplitsChange?.(newSplits);
                  if (newSplits.length === 1) {
                    onReimbursementContactChange?.(newSplits[0].contactId);
                  } else {
                    onReimbursementContactChange?.(undefined);
                  }
                }}
                contacts={contacts}
              />
            </div>
          );
        })()}
      </div>

      {/* Row 2 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('1')}>1</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('2')}>2</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('3')}>3</Button>
      <Button variant="ghost" className="w-full h-full rounded-xl bg-white/5 text-red-400 hover:bg-white/15 hover:text-red-300 transition-colors" onClick={() => handleKeyPress('DEL')}>
        <Delete className="size-5" />
      </Button>

      {/* Row 3 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('4')}>4</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('5')}>5</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('6')}>6</Button>
      <Button variant="ghost" className="w-full h-full text-xl rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('-')}>-</Button>

      {/* Row 4 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('7')}>7</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('8')}>8</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('9')}>9</Button>
      <Button variant="ghost" className="w-full h-full text-xl rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('+')}>+</Button>
      
      {/* Row 5 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('.')}>.</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('0')}>0</Button>
      <Button variant="ghost" className="w-full h-full text-xl font-mono rounded-xl bg-white/5 tracking-widest text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('00')}>00</Button>
      <Button 
        variant="ghost" 
        className={cn("w-full h-full rounded-xl flex gap-1 items-center justify-center transition-colors", 
          isExpression ? "bg-white/5 text-white hover:bg-white/15" : "bg-white text-black hover:bg-zinc-200 shadow-none"
        )} 
        onClick={() => handleKeyPress('=')}
      >
        {isExpression ? <Equal className="size-6" /> : <Check className="size-6" />}
      </Button>
      
    </div>
  );
}
