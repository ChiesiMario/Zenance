import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface AutoMarqueeProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  align?: 'left' | 'center' | 'right';
  speed?: number; // 像素/秒，預設 20
  /**
   * 是否處於即時輸入狀態。
   * 為 true 時：動畫暫停，錨定在右側末位，確保打字時最新字元始終清晰可見且不晃動；
   * 為 false 時：若內容超出容器，自動啟動平滑往復平移（Ping-Pong）跑馬燈。
   */
  isTyping?: boolean;
  /**
   * 跑馬燈起點方向。
   * 'start': 從左側起點向右捲動（預設，適用於普通靜態展示）
   * 'end': 從右側末尾向左捲動（適用於輸入完畢後以現時狀態無縫開跑）
   */
  startFrom?: 'start' | 'end';
  /**
   * 是否處於啟用/活躍狀態。
   * 預設為 true。若為 false 且內容超長時，暫停動畫並以靜態省略號（...）截斷展示首端金額。
   */
  active?: boolean;
}

/**
 * AutoMarquee: 超長文本自動跑馬燈組件
 * 當內容未超出容器寬度時，維持一般排版（居中、靠左或靠右）；
 * 當內容超出容器寬度時，自動禁止換行，並開啟絲滑的往復平移（Ping-Pong）跑馬燈動畫，
 * 兩端具備停頓停留，手指或滑鼠按下懸停時自動暫停；
 * 支援輸入狀態鎖定，打字期間固定顯示末位，停頓後以現時狀態無縫開跑，絕不閃現跳動；
 * 支援 active 狀態控制，未活躍時以省略號截斷首端，選中時啟動跑馬燈。
 */
export function AutoMarquee({
  children,
  className,
  contentClassName,
  align = 'center',
  speed = 20,
  isTyping = false,
  startFrom,
  active = true,
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

    // 關鍵防護：若容器處於 display: none 或尚未佈局 (clientWidth <= 0)，切勿執行錯誤測量
    if (availableWidth <= 0) {
      return;
    }

    const contentWidth = content.scrollWidth;
    const diff = contentWidth - availableWidth;

    if (diff > 3) {
      setOverflowDistance(prev => (Math.abs(prev - diff) > 1 ? diff : prev));
      setIsOverflowing(prev => (prev ? prev : true));
    } else {
      setOverflowDistance(prev => (prev === 0 ? prev : 0));
      setIsOverflowing(prev => (!prev ? prev : false));
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
  }, [measure, children, active]);

  // 動態計算動畫總週期：(滾動時間 + 兩端停頓時間) * 2
  // 停頓時間各約 1.4s，共 2.8s
  const duration = isOverflowing ? Math.max(5, overflowDistance / speed + 2.8) : 0;
  const effectiveStartFrom = startFrom ?? (isTyping !== undefined ? 'end' : 'start');

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-hidden max-w-full w-full [backface-visibility:hidden]',
        isOverflowing
          ? !active
            ? 'flex justify-start text-left'
            : effectiveStartFrom === 'end'
              ? 'flex justify-end text-right'
              : 'flex justify-start text-left'
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
          'shrink-0 [backface-visibility:hidden]',
          isOverflowing && !active
            ? 'truncate max-w-full block'
            : 'whitespace-nowrap inline-flex items-center',
          isOverflowing && active && !isTyping && (
            effectiveStartFrom === 'end'
              ? 'will-change-transform animate-marquee-pingpong-from-end hover:[animation-play-state:paused] active:[animation-play-state:paused]'
              : 'will-change-transform animate-marquee-pingpong hover:[animation-play-state:paused] active:[animation-play-state:paused]'
          ),
          contentClassName
        )}
        style={
          isOverflowing && active
            ? isTyping
              ? undefined
              : ({
                  '--marquee-distance': effectiveStartFrom === 'end' ? `${overflowDistance}px` : `-${overflowDistance}px`,
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
