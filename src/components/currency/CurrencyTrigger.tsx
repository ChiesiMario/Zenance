import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CurrencyTriggerProps {
  currency: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'inline' | 'button' | 'row';
  className?: string;
  showChevron?: boolean;
}

export const CurrencyTrigger: React.FC<CurrencyTriggerProps> = ({
  currency,
  onClick,
  disabled = false,
  variant = 'button',
  className,
  showChevron = true,
}) => {
  const code = currency?.toUpperCase() || 'USD';

  if (variant === 'inline') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "h-10 w-[84px] shrink-0 inline-flex items-center justify-between gap-1.5 px-3 select-none outline-none transition-colors",
          "font-mono text-sm font-semibold tracking-tight text-foreground",
          "rounded-l-lg rounded-r-none border border-input border-r-0 bg-muted/30 hover:bg-muted/60 active:bg-muted/80",
          "cursor-pointer disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        <span>{code}</span>
        {showChevron && (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 opacity-70" />
        )}
      </button>
    );
  }

  if (variant === 'row') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-end gap-1.5 select-none outline-none transition-colors",
          "font-mono text-sm font-semibold tracking-tight text-foreground",
          "hover:opacity-80 active:opacity-60 cursor-pointer disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        <span>{code}</span>
        {showChevron && (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 opacity-70" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-10 inline-flex items-center justify-between gap-2 px-3 rounded-lg select-none outline-none transition-colors",
        "border border-input bg-transparent hover:bg-muted/30 text-foreground",
        "font-mono text-sm font-semibold tracking-tight focus-visible:border-foreground",
        "cursor-pointer disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <span>{code}</span>
      {showChevron && (
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0 opacity-70" />
      )}
    </button>
  );
};
