"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ container, ...props }: DialogPrimitive.Portal.Props & { container?: HTMLElement | null }) {
  return <DialogPrimitive.Portal container={container} data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  forceRender = false,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      forceRender={forceRender}
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[60] bg-overlay backdrop-blur-[2px] data-closed:hidden touch-none",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = true,
  container,
  fullscreen = false,
  commandDeck = false,
  initialFocus,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  overlayClassName?: string
  container?: HTMLElement | null
  fullscreen?: boolean
  commandDeck?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  return (
    <DialogPortal container={container}>
      <DialogOverlay className={cn(commandDeck && "bg-overlay", overlayClassName)} />
      {fullscreen ? (
        <DialogPrimitive.Popup
          ref={contentRef}
          initialFocus={initialFocus ?? false}
          data-slot="dialog-content"
          className={cn(
            "fixed inset-0 z-[60] flex flex-col w-full h-full bg-background overflow-hidden overscroll-contain outline-none",
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      ) : commandDeck ? (
        <DialogPrimitive.Popup
          ref={contentRef}
          initialFocus={initialFocus ?? false}
          data-slot="dialog-content"
          className={cn(
            "fixed inset-0 z-[60] flex flex-col w-full h-full bg-background text-foreground outline-none px-4 pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--ios-status-blur-offset,0px))] pb-4 overflow-y-auto overscroll-contain no-scrollbar sm:fixed sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[min(380px,calc(100vw-2rem))] sm:h-[min(600px,calc(100vh-3rem))] sm:h-[min(600px,calc(100dvh-3rem))] sm:max-h-[calc(100vh-3rem)] sm:max-h-[calc(100dvh-3rem))] sm:rounded-3xl sm:bg-card sm:text-card-foreground sm:border sm:border-border sm:p-6 sm:shadow-none sm:overflow-y-auto sm:overscroll-contain",
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      ) : (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none touch-none">
          <DialogPrimitive.Popup
            ref={contentRef}
            initialFocus={initialFocus ?? false}
            data-slot="dialog-content"
            className={cn(
              "pointer-events-auto relative flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[min(88vh,calc(100%-2rem))] max-h-[min(88dvh,calc(100%-2rem))] overflow-hidden overscroll-contain rounded-xl bg-card p-5 sm:p-6 text-sm text-card-foreground border border-border shadow-none outline-none sm:max-w-[400px]",
              "[&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:flex-1 [&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:min-h-0 [&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:overflow-y-auto [&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:overflow-x-hidden [&>*:not([data-slot=dialog-header]):not([data-slot=dialog-footer]):not(form)]:overscroll-contain",
              "[&>form]:flex [&>form]:flex-col [&>form]:flex-1 [&>form]:min-h-0 [&>form]:overflow-hidden",
              "[&>form>*:not([data-slot=dialog-footer])]:flex-1 [&>form>*:not([data-slot=dialog-footer])]:min-h-0 [&>form>*:not([data-slot=dialog-footer])]:overflow-y-auto [&>form>*:not([data-slot=dialog-footer])]:overflow-x-hidden [&>form>*:not([data-slot=dialog-footer])]:overscroll-contain",
              className
            )}
            {...props}
          >
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot="dialog-close"
                render={
                  <Button
                    variant="ghost"
                    className="absolute top-4 right-4 h-8 w-8 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer z-10"
                    size="icon-sm"
                  />
                }
              >
                <XIcon className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Popup>
        </div>
      )}
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left shrink-0 pb-3", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-row items-center justify-between gap-2 pt-3 shrink-0 mt-auto [&>*:only-child]:ml-auto [&_button]:h-10 [&_button]:text-sm",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base font-semibold leading-tight tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
