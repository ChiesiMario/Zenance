import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, checked: controlledChecked, defaultChecked = false, onCheckedChange, ...props }, ref) => {
    const isControlled = controlledChecked !== undefined
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
    const isChecked = isControlled ? Boolean(controlledChecked) : internalChecked

    const handleCheckedChange = (newChecked: boolean) => {
      if (!isControlled) {
        setInternalChecked(newChecked)
      }
      onCheckedChange?.(newChecked)
    }

    return (
      <SwitchPrimitive.Root
        ref={ref}
        checked={isChecked}
        onCheckedChange={handleCheckedChange}
        data-slot="switch"
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 狀態色彩：開啟（亮白反轉）/ 關閉（可辨深灰）
          isChecked
            ? "bg-foreground border-foreground dark:bg-white dark:border-white"
            : "bg-muted/80 border-border hover:border-foreground/40 dark:bg-zinc-800 dark:border-zinc-700 dark:hover:border-zinc-500",
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block size-3.5 rounded-full transition-transform ring-0 shadow-xs",
            // 滑塊位移與色彩
            isChecked
              ? "translate-x-4.5 bg-background dark:bg-black"
              : "translate-x-0.5 bg-background dark:bg-white"
          )}
        />
      </SwitchPrimitive.Root>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
