import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Check, Equal, ChevronUp } from 'lucide-react';
import { cn, evaluateAmountExpression } from '@/lib/utils';

export interface AmountPopoverKeypadProps {
  value: string;
  onChange: (nextValue: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  allowNegative?: boolean;
  currencySymbol?: string;
  className?: string;
}

/**
 * Helper to split an expression string into leading expression text and the last active numeric operand
 */
function getLastOperand(val: string) {
  const prefix = val.startsWith('+') || val.startsWith('-') ? val[0] : '';
  const rest = val.slice(prefix.length);
  const lastOpIndex = Math.max(rest.lastIndexOf('+'), rest.lastIndexOf('-'));
  if (lastOpIndex === -1) {
    return {
      leadingText: prefix,
      operand: rest,
    };
  }
  return {
    leadingText: prefix + rest.slice(0, lastOpIndex + 1),
    operand: rest.slice(lastOpIndex + 1),
  };
}

export function AmountPopoverKeypad({
  value,
  onChange,
  onSubmit,
  onClose,
  allowNegative = false,
  className,
}: AmountPopoverKeypadProps) {
  const { t } = useTranslation();

  const isExpression = useMemo(() => {
    // Has operator after initial optional sign
    return /[+-]/.test(value.replace(/^[+-]/, ''));
  }, [value]);

  // Live preview display
  const previewDisplay = useMemo(() => {
    if (!value) return '0.00';
    if (isExpression) {
      const evaluated = evaluateAmountExpression(value, allowNegative);
      if (evaluated && evaluated !== value) {
        return `= ${evaluated}`;
      }
      return value;
    }
    // Format pure number with commas for readability
    const parts = value.split('.');
    const intPart = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = parts.length > 1 ? '.' + parts[1] : '';
    return intPart + decPart;
  }, [value, isExpression, allowNegative]);

  const handleKey = (key: string) => {
    if (key === 'C') {
      onChange('');
      return;
    }

    if (key === 'DEL') {
      if (!value) return;
      onChange(value.slice(0, -1));
      return;
    }

    if (key === '+' || key === '-') {
      if (value === '') {
        if (key === '-' && allowNegative) {
          onChange('-');
        }
        return;
      }

      // Replace trailing operator or dot
      if (value.endsWith('+') || value.endsWith('-') || value.endsWith('.')) {
        onChange(value.slice(0, -1) + key);
        return;
      }

      // If already an expression (e.g. 10+20), evaluate first then append operator
      if (isExpression) {
        const evaluated = evaluateAmountExpression(value, allowNegative);
        onChange(evaluated + key);
        return;
      }

      onChange(value + key);
      return;
    }

    if (key === '.') {
      const { leadingText, operand } = getLastOperand(value);
      if (!operand) {
        onChange(leadingText + '0.');
        return;
      }
      if (operand.includes('.')) {
        return;
      }
      onChange(value + '.');
      return;
    }

    if (key === '0') {
      const { operand } = getLastOperand(value);
      if (operand === '0') {
        // Disallow multiple leading zeros (e.g. 00)
        return;
      }
      if (operand.includes('.')) {
        const dec = operand.split('.')[1] || '';
        if (dec.length >= 2) return;
      }
      onChange(value + '0');
      return;
    }

    if (key === '00') {
      const { leadingText, operand } = getLastOperand(value);
      if (!operand || operand === '0') {
        onChange(leadingText + '0');
        return;
      }
      if (operand.includes('.')) {
        const dec = operand.split('.')[1] || '';
        if (dec.length >= 2) return;
        if (dec.length === 1) {
          onChange(value + '0');
        } else {
          onChange(value + '00');
        }
        return;
      }
      onChange(value + '00');
      return;
    }

    // Digits 1 ~ 9
    if (key >= '1' && key <= '9') {
      const { leadingText, operand } = getLastOperand(value);
      if (operand === '0') {
        // Disallow invalid leading zero: 0 followed by 5 becomes 5
        onChange(leadingText + key);
        return;
      }
      if (operand.includes('.')) {
        const dec = operand.split('.')[1] || '';
        if (dec.length >= 2) return;
      }
      onChange(value + key);
      return;
    }

    // Done or Evaluate (=)
    if (key === '=') {
      if (isExpression) {
        const evaluated = evaluateAmountExpression(value, allowNegative);
        onChange(evaluated);
      } else {
        onSubmit?.();
        onClose?.();
      }
    }
  };

  return (
    <div
      data-slot="amount-popover-keypad"
      className={cn(
        "w-[280px] sm:w-[320px] rounded-xl bg-popover border border-border p-2.5 flex flex-col gap-2 text-popover-foreground select-none shadow-none outline-none",
        className
      )}
    >
      {/* Top Helper Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
            {t('keypad.current', '當前')}:
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-emerald-500 dark:text-emerald-400 truncate">
            {previewDisplay}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleKey('C')}
            className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/60 text-foreground hover:bg-muted transition-colors cursor-pointer"
            title={t('keypad.clear', '清空')}
          >
            C
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onClose?.()}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title={t('keypad.collapse', '收起鍵盤')}
          >
            <ChevronUp className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 4x4 Grid Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {/* Row 1 */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('1')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          1
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('2')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          2
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('3')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          3
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('DEL')}
          className="h-9 sm:h-10 rounded-lg bg-muted/60 text-destructive hover:bg-destructive/10 hover:text-destructive border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
          title={t('keypad.backspace', '退格')}
        >
          <Delete className="size-4.5" />
        </button>

        {/* Row 2 */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('4')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          4
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('5')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          5
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('6')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          6
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('-')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          -
        </button>

        {/* Row 3 */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('7')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          7
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('8')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          8
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('9')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          9
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('+')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          +
        </button>

        {/* Row 4 */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('.')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          .
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('0')}
          className="h-9 sm:h-10 text-base sm:text-lg font-mono rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          0
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('00')}
          className="h-9 sm:h-10 text-xs sm:text-sm font-mono tracking-wider rounded-lg bg-muted/60 text-foreground hover:bg-muted border border-border/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-none"
        >
          00
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey('=')}
          className={cn(
            "h-9 sm:h-10 rounded-lg flex items-center justify-center transition-all active:scale-95 border cursor-pointer shadow-none",
            isExpression
              ? "bg-muted/60 text-foreground hover:bg-muted border-border/40 font-bold"
              : "bg-primary text-primary-foreground hover:bg-primary/90 border-primary font-bold"
          )}
          title={isExpression ? t('keypad.calculate', '計算') : t('keypad.done', '完成')}
        >
          {isExpression ? <Equal className="size-4.5" /> : <Check className="size-4.5" />}
        </button>
      </div>
    </div>
  );
}
