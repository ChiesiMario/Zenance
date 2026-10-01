import React, { useState, useRef, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { triggerHaptic } from '@/lib/haptics';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  dropdown?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  fullWidth?: boolean;
  size?: 'sm' | 'default';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  fullWidth = false,
  size = 'default',
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [hasTransition, setHasTransition] = useState(false);

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeEl = buttonRefs.current.get(value);
      if (!activeEl || !containerRef.current) return;
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        top: activeEl.offsetTop,
        width: activeEl.offsetWidth,
        height: activeEl.offsetHeight,
      });
    };

    updateIndicator();

    const rafId = requestAnimationFrame(() => {
      setHasTransition(true);
    });

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateIndicator();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative bg-muted/50 p-1 rounded-lg border border-border select-none',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {/* Sliding Indicator */}
      {indicatorStyle && (
        <div
          className={cn(
            'absolute top-0 left-0 rounded-md bg-background border border-border/80 shadow-none pointer-events-none z-0',
            hasTransition && 'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]'
          )}
          style={{
            transform: `translate3d(${indicatorStyle.left}px, ${indicatorStyle.top}px, 0)`,
            width: `${indicatorStyle.width}px`,
            height: `${indicatorStyle.height}px`,
          }}
          aria-hidden="true"
        />
      )}

      {options.map((option) => {
        const isSelected = option.value === value;

        const buttonElement = (
          <button
            key={option.value}
            ref={(el) => {
              if (el) {
                buttonRefs.current.set(option.value, el);
              } else {
                buttonRefs.current.delete(option.value);
              }
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled && option.value !== value) {
                triggerHaptic('selection');
                onChange(option.value);
              }
            }}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 outline-none select-none',
              fullWidth ? 'flex-1' : 'shrink-0',
              size === 'sm' ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-xs sm:text-sm',
              isSelected
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground',
              option.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer'
            )}
          >
            {option.icon && (
              <span className={cn('shrink-0 flex items-center', isSelected ? 'opacity-100' : 'opacity-70')}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
            {option.badge && (
              <span className="shrink-0 flex items-center">
                {option.badge}
              </span>
            )}
          </button>
        );

        if (option.dropdown && isSelected) {
          return (
            <DropdownMenu key={option.value}>
              <DropdownMenuTrigger render={buttonElement} />
              {option.dropdown}
            </DropdownMenu>
          );
        }

        return buttonElement;
      })}
    </div>
  );
}
