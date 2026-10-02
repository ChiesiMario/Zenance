import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface AutoMarqueeProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  align?: 'left' | 'center' | 'right';
  speed?: number; // 像素/秒，預設 35
}

/**
 * AutoMarquee: 超長文本自動跑馬燈組件
 * 當內容未超出容器寬度時，維持一般排版（居中、靠左或靠右）；
 * 當內容超出容器寬度時，自動禁止換行，並開啟絲滑的往復平移（Ping-Pong）跑馬燈動畫，
 * 兩端具備停頓停留，手指或滑鼠按下懸停時自動暫停。
 */
export function AutoMarquee({
  children,
  className,
  contentClassName,
  align = 'center',
  speed = 20,
}: AutoMarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const measure = useCallback(() => {
    if (!containerRef.current || !contentRef.current) return;
    const container = containerRef.current;
    const content = contentRef.current;

    // 扣除容器內部的 padding，計算真實可用寬度
    const style = window.getComputedStyle(container);
    const paddingLeft = parseFloat(style.paddingLeft || '0');
    const paddingRight = parseFloat(style.paddingRight || '0');
    const availableWidth = container.clientWidth - paddingLeft - paddingRight;
    const contentWidth = content.scrollWidth;

    const diff = contentWidth - availableWidth;

    if (diff > 3) {
      setOverflowDistance(diff);
      setIsOverflowing(true);
    } else {
      setOverflowDistance(0);
      setIsOverflowing(false);
    }
  }, []);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let rafId: number;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    });

    ro.observe(container);
    ro.observe(content);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [measure, children]);

  // 動態計算動畫總週期：(滾動時間 + 兩端停頓時間) * 2
  // 停頓時間各約 1.4s，共 2.8s
  const duration = isOverflowing ? Math.max(5, overflowDistance / speed + 2.8) : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-hidden max-w-full w-full',
        isOverflowing
          ? 'flex justify-start text-left'
          : align === 'center'
            ? 'flex justify-center text-center'
            : align === 'right'
              ? 'flex justify-end text-right'
              : 'flex justify-start text-left',
        className
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          'whitespace-nowrap shrink-0 inline-block will-change-transform',
          isOverflowing &&
            'animate-marquee-pingpong hover:[animation-play-state:paused] active:[animation-play-state:paused]',
          contentClassName
        )}
        style={
          isOverflowing
            ? ({
                '--marquee-distance': `-${overflowDistance}px`,
                '--marquee-duration': `${duration}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
