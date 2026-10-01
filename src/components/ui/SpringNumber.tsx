import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Global in-memory cache for remembered numbers across component mount/unmount cycles
const numberMemoryStore = new Map<string, number>();

export function getRememberedNumber(key: string): number | undefined {
  return numberMemoryStore.get(key);
}

export function setRememberedNumber(key: string, val: number): void {
  numberMemoryStore.set(key, val);
}

export function clearNumberMemory(): void {
  numberMemoryStore.clear();
}

export interface SpringNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /**
   * Unique memory key for caching previous numeric values across page/tab transitions.
   * If provided and value hasn't changed, it avoids re-animating from 0.
   */
  memoryKey?: string;
  /**
   * Spring stiffness coefficient (default: 160).
   * Higher values result in faster acceleration and response.
   */
  stiffness?: number;
  /**
   * Spring damping coefficient (default: 24).
   * Controls how smoothly the counter settles at the target value without oscillating.
   */
  damping?: number;
  /**
   * Custom format function to override default toLocaleString output.
   */
  format?: (val: number) => string;
}

export function SpringNumber({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  className,
  memoryKey,
  stiffness = 160,
  damping = 24,
  format,
}: SpringNumberProps) {
  // Check for reduced motion preference
  const isReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Retrieve cached previous value if memoryKey is supplied
  const rememberedValue = memoryKey ? getRememberedNumber(memoryKey) : undefined;
  const initialValue = isReducedMotion
    ? value
    : rememberedValue !== undefined
      ? rememberedValue
      : 0;

  const [displayValue, setDisplayValue] = useState<number>(initialValue);
  const currentPosRef = useRef<number>(initialValue);
  const velocityRef = useRef<number>(0);
  const targetRef = useRef<number>(value);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  targetRef.current = value;

  // Update memory store with latest target
  useEffect(() => {
    if (memoryKey) {
      setRememberedNumber(memoryKey, value);
    }
  }, [value, memoryKey]);

  useEffect(() => {
    if (isReducedMotion) {
      setDisplayValue(value);
      currentPosRef.current = value;
      return;
    }

    const animate = (currentTime: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime;
      }

      // Cap delta time to prevent spiral of death on background tabs
      const dt = Math.min((currentTime - lastTimeRef.current) / 1000, 0.032);
      lastTimeRef.current = currentTime;

      const target = targetRef.current;
      const currentPos = currentPosRef.current;
      const velocity = velocityRef.current;

      // Spring physics equation: F = -k * x - c * v
      const displacement = currentPos - target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * velocity;
      const acceleration = springForce + dampingForce;

      const nextVelocity = velocity + acceleration * dt;
      const nextPos = currentPos + nextVelocity * dt;

      // Settle threshold condition
      const precisionThreshold = Math.pow(10, -decimals) * 0.5;
      const isSettled = Math.abs(displacement) < precisionThreshold && Math.abs(nextVelocity) < 0.05;

      if (isSettled) {
        currentPosRef.current = target;
        velocityRef.current = 0;
        setDisplayValue(target);
        rafIdRef.current = null;
        lastTimeRef.current = null;
        return;
      }

      currentPosRef.current = nextPos;
      velocityRef.current = nextVelocity;
      setDisplayValue(nextPos);

      rafIdRef.current = requestAnimationFrame(animate);
    };

    if (rafIdRef.current === null) {
      lastTimeRef.current = null;
      rafIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [value, stiffness, damping, decimals, isReducedMotion]);

  const formatted = format
    ? format(displayValue)
    : displayValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span className={cn('tabular-nums font-mono select-text', className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
