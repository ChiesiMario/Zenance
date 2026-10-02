import { useEffect, useRef, useState } from 'react';
import { cn, formatAmountNumber } from '@/lib/utils';

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
  decimals,
  prefix = '',
  suffix = '',
  className,
  memoryKey,
  stiffness = 160,
  damping = 24,
  format,
}: SpringNumberProps) {
  // If decimals is not explicitly specified, automatically omit .00 if target value is integer
  const isTargetInteger = Math.round(Math.abs(value) * 100) % 100 === 0;
  const effectiveDecimals = decimals !== undefined ? decimals : (isTargetInteger ? 0 : 2);

  // Check for reduced motion preference
  const isReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Retrieve cached previous value if memoryKey is supplied
  const rememberedValue = memoryKey ? getRememberedNumber(memoryKey) : undefined;
  
  // 核心：若有快取且當前剛掛載處於 0 態，初始值直接採用快取值；否則直接採用真實 value
  const initialValue = isReducedMotion
    ? value
    : (value === 0 && rememberedValue !== undefined)
      ? rememberedValue
      : value;

  const [displayValue, setDisplayValue] = useState<number>(initialValue);
  const currentPosRef = useRef<number>(initialValue);
  const velocityRef = useRef<number>(0);
  const targetRef = useRef<number>(initialValue);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const prevValueRef = useRef<number>(value);

  // 初次掛載直接靜態穩定，不啟動動畫
  useEffect(() => {
    isFirstMountRef.current = false;
  }, []);

  // 當真正有外部數值變動時（例如記帳後金額改變），才觸發物理動畫
  useEffect(() => {
    const isValueChanged = prevValueRef.current !== value;
    prevValueRef.current = value;

    // 若是切換頁面或初始掛載階段，且剛好是 0 態（資料庫尚未返回），不朝 0 俯衝
    if (value === 0 && rememberedValue !== undefined && rememberedValue !== 0) {
      return;
    }

    if (memoryKey && value !== 0) {
      setRememberedNumber(memoryKey, value);
    }

    // 若為初次渲染或開啟減少動畫模式，或數值未實質改變，保持靜態
    if (isReducedMotion || isFirstMountRef.current || !isValueChanged || Math.abs(currentPosRef.current - value) < 0.0001) {
      currentPosRef.current = value;
      velocityRef.current = 0;
      targetRef.current = value;
      setDisplayValue(value);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const precisionThreshold = Math.pow(10, -effectiveDecimals) * 0.5;
    targetRef.current = value;

    if (Math.abs(currentPosRef.current - value) < precisionThreshold) {
      currentPosRef.current = value;
      velocityRef.current = 0;
      setDisplayValue(value);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const animate = (currentTime: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = currentTime;
      }

      const dt = Math.min((currentTime - lastTimeRef.current) / 1000, 0.032);
      lastTimeRef.current = currentTime;

      const target = targetRef.current;
      const currentPos = currentPosRef.current;
      const velocity = velocityRef.current;

      const displacement = currentPos - target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * velocity;
      const acceleration = springForce + dampingForce;

      const nextVelocity = velocity + acceleration * dt;
      const nextPos = currentPos + nextVelocity * dt;

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
  }, [value, stiffness, damping, effectiveDecimals, isReducedMotion, memoryKey, rememberedValue]);

  // 格式化輸出：若已靜止，且無自訂 format，採用全站標準 formatAmountNumber 確保完全一致
  const isSettled = Math.abs(currentPosRef.current - targetRef.current) < 0.001;
  const formatted = format
    ? format(displayValue)
    : isSettled
      ? formatAmountNumber(Math.abs(displayValue))
      : displayValue.toLocaleString(undefined, {
          minimumFractionDigits: effectiveDecimals,
          maximumFractionDigits: effectiveDecimals,
        });

  return (
    <span className={cn('tabular-nums font-mono select-text', className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
