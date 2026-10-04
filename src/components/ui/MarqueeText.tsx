import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface MarqueeTextProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** 自定義動畫時長（秒） */
  duration?: number;
  /** 禁用滾動 */
  disabled?: boolean;
}

/**
 * 通用超長文本自動平滑往返滾動元件 (Auto-Marquee Ping-Pong on Overflow)
 * - 當內容寬度未超出容器時：靜止且居中對齊 (justify-center)
 * - 當內容寬度超出容器時：自動計算溢出距離，利用 Compositor 線程執行無損平滑往返滾動 (transform: translateX)
 */
export function MarqueeText({
  children,
  className,
  duration,
  disabled = false,
  ...props
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState<number>(0);

  useEffect(() => {
    if (disabled) {
      setOverflowDistance(0);
      return;
    }

    const checkOverflow = () => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const diff = content.scrollWidth - container.clientWidth;
      if (diff > 1) {
        setOverflowDistance(diff);
      } else {
        setOverflowDistance(0);
      }
    };

    checkOverflow();

    // 監聽容器與視窗尺寸變化，自適應滾動距離
    const resizeObserver = new ResizeObserver(checkOverflow);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [children, disabled]);

  const isOverflowing = overflowDistance > 0;
  // 依據溢出距離自適應平滑時長，提供舒適流暢的閱讀節奏
  const animDuration = duration ?? Math.max(3, Math.min(6, 2.5 + overflowDistance / 15));

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full overflow-hidden flex items-center",
        isOverflowing ? "justify-start" : "justify-center",
        className
      )}
      {...props}
    >
      <span
        ref={contentRef}
        style={
          isOverflowing
            ? ({
                '--marquee-distance': `-${overflowDistance}px`,
                animation: `marquee-ping-pong ${animDuration}s ease-in-out infinite alternate`,
              } as React.CSSProperties)
            : undefined
        }
        className={cn("whitespace-nowrap inline-block", isOverflowing && "will-change-transform")}
      >
        {children}
      </span>
    </div>
  );
}
