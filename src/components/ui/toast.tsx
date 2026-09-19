import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export type ToastPosition = 'bottom' | 'top';

export interface ToastItem {
  id: string;
  message: string;
  duration?: number;
  position?: ToastPosition;
}

export interface ToastOptions {
  duration?: number;
  position?: ToastPosition;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach(listener => listener([...toasts]));
}

export const toast = (message: string, options?: ToastOptions) => {
  const id = Math.random().toString(36).substring(2, 9);
  const duration = options?.duration ?? 2500;
  const position = options?.position;
  
  // 避免相同訊息短時間內重複堆疊
  const filtered = toasts.filter(t => t.message !== message);
  const newItem: ToastItem = { id, message, duration, position };
  toasts = [...filtered, newItem];
  notify();

  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notify();
  }, duration);
};

toast.show = toast;

export interface ToasterProps {
  defaultPosition?: ToastPosition;
}

export function Toaster({ defaultPosition = 'bottom' }: ToasterProps) {
  const [currentToasts, setCurrentToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleUpdate = (updated: ToastItem[]) => {
      setCurrentToasts(updated);
    };

    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  if (currentToasts.length === 0 || typeof document === 'undefined') return null;

  const bottomToasts = currentToasts.filter(t => (t.position ?? defaultPosition) === 'bottom');
  const topToasts = currentToasts.filter(t => (t.position ?? defaultPosition) === 'top');

  return createPortal(
    <>
      {/* 預設靠下位置容器（bottom-20，避開底部導覽列且浮在鍵盤之上） */}
      {bottomToasts.length > 0 && (
        <div 
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md"
        >
          {bottomToasts.map((item) => (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto select-none",
                "px-4 py-2.5 rounded-lg",
                "bg-foreground text-background text-xs sm:text-sm font-medium",
                "border-none shadow-none",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
                "text-center max-w-full truncate"
              )}
            >
              {item.message}
            </div>
          ))}
        </div>
      )}

      {/* 靠上位置容器（備用/按需配置） */}
      {topToasts.length > 0 && (
        <div 
          aria-live="polite"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md"
        >
          {topToasts.map((item) => (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto select-none",
                "px-4 py-2.5 rounded-lg",
                "bg-foreground text-background text-xs sm:text-sm font-medium",
                "border-none shadow-none",
                "animate-in fade-in slide-in-from-top-2 duration-200",
                "text-center max-w-full truncate"
              )}
            >
              {item.message}
            </div>
          ))}
        </div>
      )}
    </>,
    document.body
  );
}
