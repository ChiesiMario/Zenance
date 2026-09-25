import { useState, useRef, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { AmountPopoverKeypad } from '@/components/ui/AmountPopoverKeypad';
import { sanitizeAmountInput, evaluateAmountExpression, cn } from '@/lib/utils';

export interface AmountInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (val: string) => void;
  allowNegative?: boolean;
  currencySymbol?: string;
  disableKeypad?: boolean;
  onSubmitAmount?: () => void;
  unstyled?: boolean;
}

interface Coords {
  top: number;
  left: number;
  width: number;
  placement: 'bottom' | 'top';
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  {
    value = '',
    onChange,
    onValueChange,
    allowNegative = false,
    currencySymbol,
    disableKeypad = false,
    onSubmitAmount,
    unstyled = false,
    className,
    onFocus,
    onClick,
    onKeyDown,
    ...props
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  // Synchronous position measurement
  const calculateCoords = (): Coords | null => {
    if (!inputRef.current) return null;
    const rect = inputRef.current.getBoundingClientRect();
    const keypadHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Desired width: matches input or default 300px
    const popoverWidth = Math.min(Math.max(rect.width, 280), 320);

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }
    if (left < 12) left = 12;

    if (spaceBelow < keypadHeight && spaceAbove > spaceBelow) {
      return {
        top: Math.max(8, rect.top - keypadHeight - 8),
        left,
        width: popoverWidth,
        placement: 'top',
      };
    } else {
      return {
        top: rect.bottom + 8,
        left,
        width: popoverWidth,
        placement: 'bottom',
      };
    }
  };

  const openKeypad = () => {
    if (disableKeypad) return;
    if (typeof navigator !== 'undefined' && 'virtualKeyboard' in navigator) {
      (navigator as any).virtualKeyboard?.hide?.();
    }
    const initialCoords = calculateCoords();
    if (initialCoords) {
      setCoords(initialCoords);
    }
    setIsOpen(true);
  };

  const closeKeypad = () => {
    setIsOpen(false);
    setCoords(null);
  };

  // Re-calculate position before paint and on scroll/resize
  useLayoutEffect(() => {
    if (!isOpen) return;

    const nextCoords = calculateCoords();
    if (nextCoords) {
      setCoords(nextCoords);
    }

    const handleScrollOrResize = () => {
      const updated = calculateCoords();
      if (updated) {
        setCoords(updated);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
    };
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (inputRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;

      closeKeypad();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  const triggerChange = (nextVal: string) => {
    onValueChange?.(nextVal);

    if (onChange && inputRef.current) {
      // Create synthetic event for compatibility with standard React handlers
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputRef.current, nextVal);
      }
      const event = new Event('input', { bubbles: true });
      inputRef.current.dispatchEvent(event);

      // Also call standard onChange directly
      const syntheticEvent = {
        target: { value: nextVal },
        currentTarget: { value: nextVal },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = sanitizeAmountInput(raw, { allowNegative });
    triggerChange(clean);
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    openKeypad();
    onFocus?.(e);
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    openKeypad();
    onClick?.(e);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeKeypad();
    } else if (e.key === 'Enter') {
      if (isOpen) {
        const evaluated = evaluateAmountExpression(value, allowNegative);
        if (evaluated && evaluated !== value) {
          triggerChange(evaluated);
        }
        closeKeypad();
      }
      onSubmitAmount?.();
    }
    onKeyDown?.(e);
  };

  const handleKeypadChange = (nextVal: string) => {
    triggerChange(nextVal);
  };

  const handleKeypadSubmit = () => {
    const evaluated = evaluateAmountExpression(value, allowNegative);
    if (evaluated && evaluated !== value) {
      triggerChange(evaluated);
    }
    closeKeypad();
    onSubmitAmount?.();
  };

  return (
    <>
      {unstyled ? (
        <input
          ref={inputRef}
          type="text"
          inputMode={disableKeypad ? "decimal" : "none"}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          className={cn('font-mono', className)}
          {...props}
        />
      ) : (
        <Input
          ref={inputRef}
          type="text"
          inputMode={disableKeypad ? "decimal" : "none"}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          className={cn('font-mono', className)}
          {...props}
        />
      )}

      {isOpen &&
        !disableKeypad &&
        typeof document !== 'undefined' &&
        createPortal(
          isMobile ? (
            <>
              {/* Mobile Backdrop - Transparent */}
              <div
                className="fixed inset-0 z-[998] bg-transparent"
                onClick={closeKeypad}
              />
              {/* Bottom Sheet Keypad */}
              <div
                ref={popoverRef}
                style={{
                  paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
                }}
                className="fixed inset-x-0 bottom-0 z-[999] bg-popover border-t border-border px-3 pt-2 rounded-t-2xl shadow-none flex flex-col items-center animate-in slide-in-from-bottom duration-200"
              >
                {/* Drag Handle Indicator */}
                <div
                  className="w-8 h-1 rounded-full bg-muted-foreground/30 mb-2 shrink-0 cursor-pointer hover:bg-muted-foreground/50 transition-colors"
                  onClick={closeKeypad}
                  aria-hidden="true"
                />
                <AmountPopoverKeypad
                  value={value}
                  onChange={handleKeypadChange}
                  onSubmit={handleKeypadSubmit}
                  onClose={closeKeypad}
                  allowNegative={allowNegative}
                  currencySymbol={currencySymbol}
                  className="w-full max-w-sm border-0 p-0 bg-transparent"
                />
              </div>
            </>
          ) : (
            coords !== null && (
              <div
                ref={popoverRef}
                style={{
                  position: 'fixed',
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  width: `${coords.width}px`,
                  zIndex: 999,
                }}
                className="animate-in fade-in-0 slide-in-from-bottom-3 duration-200 ease-out"
              >
                <AmountPopoverKeypad
                  value={value}
                  onChange={handleKeypadChange}
                  onSubmit={handleKeypadSubmit}
                  onClose={closeKeypad}
                  allowNegative={allowNegative}
                  currencySymbol={currencySymbol}
                  className="w-full"
                />
              </div>
            )
          ),
          document.body
        )}
    </>
  );
});
