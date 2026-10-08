import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccounts } from '@/hooks/useAccounts';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import type { Contact } from '@/services/db/db';

export interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  contact?: Contact | null;
  hasTransactions?: boolean;
  onSuccess?: (contact: Contact) => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

export function ContactFormDialog({
  open,
  onOpenChange,
  mode,
  contact,
  hasTransactions = false,
  onSuccess,
  onDeleted,
  onArchived,
}: ContactFormDialogProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { addAccount, updateAccount, archiveAccount, unarchiveAccount, deleteAccount } = useAccounts();

  const [name, setName] = useState('');
  const [group, setGroup] = useState('personal');

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && contact) {
        setName(contact.name || '');
        setGroup(contact.group || 'personal');
      } else {
        setName('');
        setGroup('personal');
      }
    }
  }, [open, mode, contact]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (mode === 'create') {
      const newContact = await addAccount(trimmedName, 'contact', 0, undefined, group);
      if (newContact) {
        onSuccess?.(newContact as unknown as Contact);
      }
    } else if (mode === 'edit' && contact) {
      await updateAccount(contact.id, {
        name: trimmedName,
        group,
      });
      onSuccess?.({
        ...contact,
        name: trimmedName,
        group,
      });
    }

    onOpenChange(false);
  };

  const handleArchiveToggle = async () => {
    if (!contact) return;
    if (contact.archived) {
      await unarchiveAccount(contact.id);
    } else {
      await archiveAccount(contact.id);
    }
    onArchived?.();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!contact) return;
    if (hasTransactions) {
      toast(t('contacts.cannotDeleteHasTransactions'));
      return;
    }

    const confirmed = await confirm({
      title: t('contacts.deleteContact'),
      description: t('contacts.deleteContactConfirm'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });

    if (!confirmed) return;

    const res = await deleteAccount(contact.id);
    if (!res.success) {
      toast(
        res.reason === 'has_transactions'
          ? t('contacts.cannotDeleteHasTransactions')
          : t('common.error')
      );
    } else {
      onDeleted?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px] max-w-[340px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <User className="size-5 text-primary" />
            <span>{mode === 'create' ? t('contacts.addContact') : t('contacts.editContact')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 對象名稱 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('contacts.contactName')}
            </label>
            <Input
              placeholder={t('contacts.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleSubmit()}
              className="h-10 text-sm"
            />
          </div>

          {/* 對象類型 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('contacts.type')}
            </label>
            <Select value={group} onValueChange={(val) => val && setGroup(val)}>
              <SelectTrigger className="w-full h-10 text-sm">
                <SelectValue>
                  {group === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{t('contacts.groupPersonal')}</SelectItem>
                <SelectItem value="organization">{t('contacts.groupOrganization')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 對象管理動作（僅編輯模式展示：歸檔 / 刪除） */}
          {mode === 'edit' && contact && (
            <div className="rounded-lg border border-border grid grid-cols-2 divide-x divide-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={handleArchiveToggle}
                className="h-10 flex items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer select-none px-2 text-center"
              >
                <span>
                  {contact.archived ? t('contacts.unarchiveContact') : t('contacts.archiveContact')}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className={cn(
                  "h-10 flex items-center justify-center text-xs font-medium transition-colors cursor-pointer select-none px-2 text-center",
                  hasTransactions
                    ? "opacity-50 text-muted-foreground hover:bg-muted/20"
                    : "text-muted-foreground hover:text-destructive hover:bg-muted/30 active:bg-muted/50"
                )}
              >
                <span>{t('contacts.deleteContact')}</span>
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-3 sm:gap-3 pt-1">
          <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="cursor-pointer"
          >
            {mode === 'create' ? t('common.create', '建立') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
