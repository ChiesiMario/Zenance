import React from 'react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'bg-muted/50 p-1 rounded-lg border border-border select-none',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        const buttonElement = (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled && option.value !== value) {
                onChange(option.value);
              }
            }}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 outline-none',
              fullWidth ? 'flex-1' : 'shrink-0',
              size === 'sm' ? 'py-1 px-2.5 text-xs' : 'py-1.5 px-3 text-xs sm:text-sm',
              isSelected
                ? 'bg-background text-foreground border border-border/40 font-semibold shadow-none'
                : 'text-muted-foreground hover:text-foreground border border-transparent',
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
