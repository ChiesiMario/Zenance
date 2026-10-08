import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCurrencyInfo } from '@/lib/currencies';
import { cn } from '@/lib/utils';

export interface CurrencyTriggerProps {
  currency: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'inline' | 'button' | 'row' | 'card';
  label?: React.ReactNode;
  showName?: boolean;
  className?: string;
  showChevron?: boolean;
}

export const CurrencyTrigger: React.FC<CurrencyTriggerProps> = ({
  currency,
  onClick,
  disabled = false,
  variant = 'button',
  label,
  showName = false,
  className,
  showChevron = true,
}) => {
  const { t } = useTranslation();
  const code = currency?.toUpperCase() || 'USD';
  const info = getCurrencyInfo(code);
  const localizedName = info?.i18nKey ? t(info.i18nKey) : undefined;

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

  if (variant === 'card') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "w-full border border-border rounded-lg p-2.5 flex items-center justify-between bg-card transition-colors select-none text-left",
          !disabled ? "hover:bg-muted/30 active:bg-muted/50 cursor-pointer" : "opacity-60 cursor-not-allowed",
          className
        )}
      >
        {label && (
          <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        )}
        <div className="inline-flex items-center justify-end gap-1.5 min-w-0 pl-2">
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground shrink-0">
            {code}
          </span>
          {showName && localizedName && (
            <span className="text-xs font-normal text-muted-foreground opacity-60 truncate">
              ({localizedName})
            </span>
          )}
          {showChevron && (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0 opacity-70" />
          )}
        </div>
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
        {showName && localizedName && (
          <span className="text-xs font-normal text-muted-foreground opacity-60 truncate">
            ({localizedName})
          </span>
        )}
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
      <div className="inline-flex items-center gap-1.5 min-w-0">
        <span className="shrink-0">{code}</span>
        {showName && localizedName && (
          <span className="text-xs font-normal text-muted-foreground opacity-60 truncate">
            ({localizedName})
          </span>
        )}
      </div>
      {showChevron && (
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0 opacity-70" />
      )}
    </button>
  );
};
