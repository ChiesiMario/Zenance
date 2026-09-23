import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { parseISO, format, isValid } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  value?: string; // "yyyy-MM-dd"
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  id,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Safe parse ISO date string
  const selectedDate = (() => {
    if (!value) return new Date();
    try {
      const parsed = parseISO(value);
      return isValid(parsed) ? parsed : new Date();
    } catch {
      return new Date();
    }
  })();

  const displayDate = value && isValid(selectedDate) ? format(selectedDate, 'yyyy-MM-dd') : '';

  return (
    <div className="relative w-full">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={cn(
          "h-9 w-full px-3 rounded-lg border border-border bg-background/50 hover:bg-muted/50 text-foreground transition-colors cursor-pointer text-xs font-mono flex items-center justify-between gap-2 shadow-none disabled:opacity-50 disabled:cursor-not-allowed select-none",
          className
        )}
      >
        <span className={cn("truncate", !displayDate && "text-muted-foreground")}>
          {displayDate || placeholder || "YYYY-MM-DD"}
        </span>
        <CalendarDays className="size-3.5 text-muted-foreground shrink-0" />
      </button>

      {isOpen && typeof document !== 'undefined' && (
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center isolate">
            {/* Full-screen Backdrop */}
            <div
              className="absolute inset-0 bg-background/40 backdrop-blur-md transition-opacity duration-200 animate-in fade-in-0"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Calendar Popup */}
            <div className="relative z-10 w-auto flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
              <Calendar
                selected={selectedDate}
                onSelect={(d: Date) => {
                  onChange(format(d, 'yyyy-MM-dd'));
                }}
                onClose={() => setIsOpen(false)}
              />
            </div>
          </div>,
          document.body
        )
      )}
    </div>
  );
}
