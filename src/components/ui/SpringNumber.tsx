import { cn, formatAmountNumber } from '@/lib/utils';
import {
  getRememberedNumber,
  setRememberedNumber,
  clearNumberMemory,
} from '@/lib/numberMemory';

// Re-export for backward compatibility
export { getRememberedNumber, setRememberedNumber, clearNumberMemory };

export interface SpringNumberProps {
  value?: number | null;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /**
   * Kept for prop compatibility
   */
  memoryKey?: string;
  /**
   * Kept for prop compatibility
   */
  stiffness?: number;
  /**
   * Kept for prop compatibility
   */
  damping?: number;
  /**
   * Custom format function to override default toLocaleString output.
   */
  format?: (val: number) => string;
}

/**
 * SpringNumber (Instant Static Numeric Display)
 * Direct, synchronous rendering without spring physics or animation lag.
 */
export function SpringNumber({
  value,
  decimals,
  prefix = '',
  suffix = '',
  className,
  format,
}: SpringNumberProps) {
  if (value === undefined || value === null || isNaN(value)) {
    return (
      <span className={cn('tabular-nums font-mono select-text text-muted-foreground', className)}>
        {prefix}--{suffix}
      </span>
    );
  }

  const isTargetInteger = Math.round(Math.abs(value) * 100) % 100 === 0;
  const effectiveDecimals = decimals !== undefined ? decimals : (isTargetInteger ? 0 : 2);

  const formatted = format
    ? format(value)
    : decimals !== undefined
      ? Math.abs(value).toLocaleString(undefined, {
          minimumFractionDigits: effectiveDecimals,
          maximumFractionDigits: effectiveDecimals,
        })
      : formatAmountNumber(Math.abs(value));

  return (
    <span className={cn('tabular-nums font-mono select-text', className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
