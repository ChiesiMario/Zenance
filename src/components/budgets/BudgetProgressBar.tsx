import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Global session memory for budget animation states and last known values
const animatedBudgetKeys = new Set<string>();
const lastKnownPercentages = new Map<string, number>();

export interface BudgetProgressBarProps {
  /** Unique key to identify the budget instance across route changes (e.g. budget.id or budget.id_period) */
  budgetKey: string;
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
  /**
   * If true, animate only on the first load in the current session.
   * Subsequent route switches will render instantly without replaying 0% -> N% expansion.
   * Defaults to true.
   */
  animateFirstMountOnly?: boolean;
}

export const BudgetProgressBar: React.FC<BudgetProgressBarProps> = ({
  budgetKey,
  percentage,
  isOver = false,
  variant = 'primary',
  heightClass = 'h-1.5',
  className,
  animateFirstMountOnly = true,
}) => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Check if this budget item has already been animated in the current session
  const hasAnimated = animatedBudgetKeys.has(budgetKey);

  // Fallback to last known percentage if incoming is 0 during async Dexie data hydration
  const effectivePercentage =
    percentage > 0
      ? percentage
      : lastKnownPercentages.get(budgetKey) ?? percentage;

  const clampedTarget = Math.min(100, Math.max(0, effectivePercentage));

  // Determine initial render state
  const shouldSkipAnimation = prefersReducedMotion || (animateFirstMountOnly && hasAnimated);

  const [displayedWidth, setDisplayedWidth] = useState<number>(() => {
    if (shouldSkipAnimation) {
      return clampedTarget;
    }
    // If first load and has value > 0, start at 0 and animate to target
    return 0;
  });

  const [enableTransition, setEnableTransition] = useState<boolean>(() => {
    // If skipping initial expansion animation, start with transition-none
    return !shouldSkipAnimation;
  });

  const hasAnimatedRef = useRef(hasAnimated);

  // Save last known percentage whenever valid
  useEffect(() => {
    if (percentage > 0) {
      lastKnownPercentages.set(budgetKey, percentage);
    }
  }, [budgetKey, percentage]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedWidth(clampedTarget);
      setEnableTransition(false);
      return;
    }

    if (!animateFirstMountOnly) {
      // Always animate mode
      setEnableTransition(true);
      const timer = requestAnimationFrame(() => {
        setDisplayedWidth(clampedTarget);
      });
      return () => cancelAnimationFrame(timer);
    }

    if (hasAnimatedRef.current) {
      // Already animated in previous view / page: display instantly
      setDisplayedWidth(clampedTarget);

      // Re-enable transition shortly after mount so future mutations (e.g. new transactions) animate smoothly
      const timer = setTimeout(() => {
        setEnableTransition(true);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // First time seen: play entry animation
      if (clampedTarget > 0) {
        setEnableTransition(true);
        const raf = requestAnimationFrame(() => {
          setDisplayedWidth(clampedTarget);
          animatedBudgetKeys.add(budgetKey);
          hasAnimatedRef.current = true;
        });
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [budgetKey, clampedTarget, animateFirstMountOnly, prefersReducedMotion]);

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
          'h-full rounded-full',
          enableTransition
            ? 'transition-[width] duration-700 ease-out'
            : 'transition-none',
          getFillColorClass()
        )}
        style={{ width: `${displayedWidth}%` }}
      />
    </div>
  );
};
