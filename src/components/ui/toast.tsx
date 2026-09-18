import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ToastItem {
  id: string;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach(listener => listener([...toasts]));
}

export const toast = (message: string, options?: { duration?: number }) => {
  const id = Math.random().toString(36).substring(2, 9);
  const duration = options?.duration ?? 3000;
  
  const newItem: ToastItem = { id, message, duration };
  toasts = [...toasts, newItem];
  notify();

  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notify();
  }, duration);
};

toast.show = toast;

export function Toaster() {
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

  if (currentToasts.length === 0) return null;

  return (
    <div 
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md"
    >
      {currentToasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto select-none",
            "px-4 py-2.5 rounded-lg",
            "bg-foreground text-background text-xs sm:text-sm font-medium",
            "border border-border shadow-none",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
            "text-center max-w-full truncate"
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
