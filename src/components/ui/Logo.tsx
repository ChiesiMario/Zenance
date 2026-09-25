import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  showBorder?: boolean;
}

export function Logo({
  size = 48,
  className,
  showBorder = true,
  ...props
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "rounded-[23%] shrink-0 select-none overflow-hidden",
        showBorder && "border border-border/60",
        className
      )}
      {...props}
    >
      {/* 黑色背景基底 */}
      <rect width="512" height="512" rx="120" fill="#000000" />
      
      {/* Zenance 符號：中央基準線與穿插 Z */}
      <g fill="none" stroke="#ffffff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round">
        {/* 中央基準線 */}
        <path d="M 256 120 L 256 392" />
        {/* 穿插的 Z */}
        <path d="M 150 180 L 362 180 L 150 332 L 362 332" />
      </g>
    </svg>
  );
}
