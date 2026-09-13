import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addDays
} from "date-fns"
import { Button } from "@/components/ui/button"

export type CalendarProps = {
  selected?: Date
  onSelect?: (date: Date) => void
  className?: string
}

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(selected || new Date())

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1))
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  let days = eachDayOfInterval({
    start: startDate,
    end: endDate
  })

  // Ensure exactly 6 weeks (42 days) to prevent height jumps
  if (days.length < 42) {
    const extraDaysNeeded = 42 - days.length
    const nextDays = eachDayOfInterval({
      start: addDays(endDate, 1),
      end: addDays(endDate, extraDaysNeeded)
    })
    days = [...days, ...nextDays]
  }

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div className={cn("p-3 select-none w-fit mx-auto", className)}>
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" onClick={handlePreviousMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium tracking-tight text-foreground">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-3">
        {weekDays.map(day => (
          <div key={day} className="text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground pb-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const isSelected = selected ? isSameDay(day, selected) : false
          const isCurrentMonth = isSameMonth(day, monthStart)
          const isCurrentToday = isToday(day)

          return (
            <button
              key={idx}
              onClick={() => onSelect?.(day)}
              className={cn(
                "h-10 w-10 flex items-center justify-center text-sm font-mono transition-all rounded-md",
                // Base states
                !isCurrentMonth && "text-muted-foreground/30",
                isCurrentMonth && !isSelected && "hover:bg-muted/50 text-foreground",
                // Selected state (Pure contrast)
                isSelected && "bg-foreground text-background font-medium",
                // Today state (Subtle border, no background unless selected)
                isCurrentToday && !isSelected && "border border-foreground/20 text-foreground",
                // Out of month, but selected (rare but possible if selecting before changing view)
                !isCurrentMonth && isSelected && "bg-foreground/50 text-background"
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
