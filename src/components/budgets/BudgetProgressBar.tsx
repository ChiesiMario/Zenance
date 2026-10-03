import React from 'react';
import { cn } from '@/lib/utils';

export interface BudgetProgressBarProps {
  /** Unique key to identify the budget instance (kept for prop compatibility) */
  budgetKey?: string;
  /** Progress percentage (0 - 100) */
  percentage: number;
  /** Whether the budget is currently overspent */
  isOver?: boolean;
  /** Color variant for regular (non-overspent) state */
  variant?: 'primary' | 'foreground' | 'muted';
  /** Custom height class (defaults to h-1.5) */
  heightClass?: string;
  /** Additional container styling */
  className?: string;
  /** Kept for prop compatibility */
  animateFirstMountOnly?: boolean;
}

export const BudgetProgressBar: React.FC<BudgetProgressBarProps> = ({
  percentage,
  isOver = false,
  variant = 'primary',
  heightClass = 'h-1.5',
  className,
}) => {
  const clampedTarget = Math.min(100, Math.max(0, percentage));

  // Color mapping based on variant and isOver
  const getFillColorClass = () => {
    if (isOver) {
      return 'bg-destructive';
    }
    switch (variant) {
      case 'foreground':
        return 'bg-foreground';
      case 'muted':
        return 'bg-muted-foreground/60';
      case 'primary':
      default:
        return 'bg-primary';
    }
  };

  return (
    <div
      className={cn(
        'w-full bg-muted overflow-hidden rounded-full',
        heightClass,
        className
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-none',
          getFillColorClass()
        )}
        style={{ width: `${clampedTarget}%` }}
      />
    </div>
  );
};
