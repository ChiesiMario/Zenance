import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title?: React.ReactNode;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const context = React.useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context.confirm;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleCancel();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="confirm-dialog-overlay"
          className="fixed inset-0 isolate z-[75] bg-background/40 backdrop-blur-md duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="confirm-dialog-content"
          className={cn(
            'fixed top-1/2 left-1/2 z-[75] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-card p-5 text-sm text-card-foreground border border-border shadow-none duration-150 outline-none sm:max-w-[360px] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'
          )}
        >
          <div className="flex flex-col gap-1.5 text-left">
            {title && (
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
            )}
            <div className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer w-full"
              onClick={handleCancel}
            >
              {cancelText || t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              className="cursor-pointer w-full"
              onClick={handleConfirm}
            >
              {confirmText || t('common.confirm')}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setIsOpen(false);
  }, []);

  const handleCancel = React.useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setIsOpen(false);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <ConfirmDialog
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) handleCancel();
          }}
          title={options.title}
          description={options.description}
          confirmText={options.confirmText}
          cancelText={options.cancelText}
          variant={options.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}
