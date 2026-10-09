import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyTrigger } from '@/components/currency/CurrencyTrigger';
import { CurrencySelectDialog } from '@/components/currency/CurrencySelectDialog';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Ledger } from '@/services/db/db';

export interface ManageLedgersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageLedgersDialog({
  open,
  onOpenChange,
}: ManageLedgersDialogProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { ledgers, deleteLedger } = useLedgers();
  const { activeLedgerId, setActiveLedgerId } = useAppStore();

  // 獨立編輯帳本彈窗狀態 (平級 Sibling Dialog)
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);

  // 第一階段手動輸入名稱確認刪除狀態 (平級 Sibling Dialog)
  const [ledgerToDelete, setLedgerToDelete] = useState<Ledger | null>(null);

  // 新建帳本狀態 (平級 Sibling Dialog)
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 切換當前活動帳本
  const handleSelectLedger = (ledgerId: string) => {
    if (ledgerId !== activeLedgerId) {
      setActiveLedgerId(ledgerId);
      toast.show(t('dashboard.switchLedger'));
    }
  };

  // 開啟獨立編輯 Dialog
  const handleStartEdit = (ledger: Ledger, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLedger(ledger);
  };

  // 開啟第一階段輸入名稱刪除 Dialog
  const handleStartDelete = (ledger: Ledger, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ledgers || ledgers.length <= 1) {
      toast.show(t('ledgers.cannotDeleteOnlyOne'));
      return;
    }
    setLedgerToDelete(ledger);
  };

  // 第一階段名稱輸入正確後，進入第二階段最後確認
  const handleProceedToFinalConfirm = async (ledger: Ledger) => {
    setLedgerToDelete(null);

    const confirmed = await confirm({
      title: t('ledgers.finalDeleteConfirmTitle', '最後確認刪除'),
      description: t('ledgers.finalDeleteConfirmDesc', { name: ledger.name }),
      confirmText: t('ledgers.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });

    if (confirmed) {
      await deleteLedger(ledger.id);

      // 若刪除的是當前活動帳本，自動切換至另一個帳本
      if (activeLedgerId === ledger.id && ledgers && ledgers.length > 1) {
        const anotherLedger = ledgers.find((l) => l.id !== ledger.id);
        if (anotherLedger) setActiveLedgerId(anotherLedger.id);
      }

      toast.show(t('ledgers.deleteSuccess'));
    }
  };

  return (
    <>
      {/* 主彈窗：管理帳本清單 */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              <span>{t('dashboard.manageLedgers')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-1 space-y-3">
            <div className="border border-border rounded-lg divide-y divide-border bg-card overflow-hidden">
              {ledgers?.map((ledger) => {
                const isActive = ledger.id === activeLedgerId;

                return (
                  <div
                    key={ledger.id}
                    onClick={() => handleSelectLedger(ledger.id)}
                    className={cn(
                      'group flex items-center justify-between gap-3 min-h-12 px-3.5 py-2.5 text-sm transition-colors cursor-pointer select-none',
                      isActive
                        ? 'bg-foreground text-background'
                        : 'hover:bg-muted/20 text-foreground'
                    )}
                  >
                    {/* 左側：帳本名稱 + 貨幣徽章 (已刪除 ✅ 和使用中膠囊，依靠背景高亮) */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={cn(
                          'truncate text-sm',
                          isActive ? 'text-background font-semibold' : 'text-foreground/90 font-medium'
                        )}
                      >
                        {ledger.name}
                      </span>

                      <span
                        className={cn(
                          'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0',
                          isActive
                            ? 'border-background/25 text-background/90 bg-background/15'
                            : 'border-border text-muted-foreground bg-muted/20'
                        )}
                      >
                        {ledger.baseCurrency || 'CNY'}
                      </span>
                    </div>

                    {/* 右側：動作按鈕 (手機友好尺寸 size-8) */}
                    <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'size-8 cursor-pointer transition-colors',
                          isActive
                            ? 'text-background opacity-85 hover:opacity-100 hover:text-background hover:bg-background/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        )}
                        title={t('ledgers.editLedger', '編輯帳本')}
                        onClick={(e) => handleStartEdit(ledger, e)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={(ledgers?.length || 0) <= 1}
                        className={cn(
                          'size-8 cursor-pointer transition-colors disabled:opacity-45',
                          isActive
                            ? 'text-background opacity-85 hover:text-red-300 hover:opacity-100 hover:bg-background/20 disabled:hover:text-background disabled:hover:bg-transparent'
                            : 'text-muted-foreground hover:text-destructive hover:bg-muted disabled:hover:text-muted-foreground disabled:hover:bg-transparent'
                        )}
                        title={t('ledgers.delete')}
                        onClick={(e) => handleStartDelete(ledger, e)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="cursor-pointer text-xs h-10 gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>{t('dashboard.createLedger')}</span>
            </Button>
            <DialogClose render={<Button variant="default" type="button" className="cursor-pointer text-xs h-10 px-4" />}>
              {t('common.done', '完成')}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 次級平級 Dialog：獨立編輯帳本 (z-[70]) */}
      <EditLedgerDialog
        open={!!editingLedger}
        onOpenChange={(isOpen) => !isOpen && setEditingLedger(null)}
        ledger={editingLedger}
      />

      {/* 次級平級 Dialog：建立新帳本 (z-[70]) */}
      <CreateLedgerDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {/* 次級平級 Dialog：第一階段輸入名稱確認刪除帳本 (z-[70]) */}
      <DeleteLedgerDialog
        open={!!ledgerToDelete}
        onOpenChange={(isOpen) => !isOpen && setLedgerToDelete(null)}
        ledger={ledgerToDelete}
        onProceed={handleProceedToFinalConfirm}
      />
    </>
  );
}

export interface EditLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: Ledger | null;
  onUpdated?: (updatedLedger: Ledger) => void;
}

export function EditLedgerDialog({
  open,
  onOpenChange,
  ledger,
  onUpdated,
}: EditLedgerDialogProps) {
  const { t } = useTranslation();
  const { updateLedger } = useLedgers();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);

  // 檢查該帳本是否包含任何數據（交易、帳戶、預算等）
  const hasData = useLiveQuery(async () => {
    if (!ledger?.id) return false;
    const [txCount, accCount, budgetCount] = await Promise.all([
      db.transactions.where('ledgerId').equals(ledger.id).filter(t => !t.deleted).count(),
      db.accounts.where('ledgerId').equals(ledger.id).filter(a => !a.deleted).count(),
      db.budgets.where('ledgerId').equals(ledger.id).filter(b => !b.deleted).count(),
    ]);
    return (txCount + accCount + budgetCount) > 0;
  }, [ledger?.id]);

  const isCurrencyLocked = Boolean(hasData);

  useEffect(() => {
    if (ledger && open) {
      setName(ledger.name);
      setCurrency(ledger.baseCurrency || 'CNY');
    }
  }, [ledger, open]);

  const handleCurrencyTriggerClick = () => {
    if (isCurrencyLocked) {
      toast.show(t('ledgers.cannotChangeCurrencyWithData'));
      return;
    }
    setIsCurrencyDialogOpen(true);
  };

  const handleSave = async () => {
    if (!ledger) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    // 若有數據，不允許修改幣別，強制鎖定為原有本位幣
    const targetCurrency = isCurrencyLocked ? (ledger.baseCurrency || 'CNY') : currency;

    await updateLedger(ledger.id, {
      name: trimmed,
      baseCurrency: targetCurrency,
    });

    toast.show(t('ledgers.updateSuccess'));
    onOpenChange(false);
    onUpdated?.({
      ...ledger,
      name: trimmed,
      baseCurrency: targetCurrency,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[320px] max-w-[320px] p-5 gap-4 z-[70]"
          overlayClassName="z-[70]"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-primary" />
              <span>{t('ledgers.editLedger')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-1 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('ledgers.ledgerName')}
              </label>
              <Input
                placeholder={t('ledgers.ledgerName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="h-10 text-sm font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('ledgers.baseCurrency')}
                </label>
                {isCurrencyLocked && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t('ledgers.currencyLocked', '已鎖定')}
                  </span>
                )}
              </div>
              <div
                onClick={handleCurrencyTriggerClick}
                className={cn(
                  "w-full rounded-lg transition-colors",
                  isCurrencyLocked ? "cursor-not-allowed" : "cursor-pointer"
                )}
              >
                <CurrencyTrigger
                  currency={currency}
                  onClick={handleCurrencyTriggerClick}
                  className={cn(
                    "w-full justify-between h-10",
                    isCurrencyLocked && "opacity-60 bg-muted/20 pointer-events-none hover:bg-muted/20"
                  )}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:gap-2">
            <DialogClose render={<Button variant="ghost" type="button" className="cursor-pointer text-xs h-10" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={!name.trim()}
              className="cursor-pointer text-xs h-10 px-4"
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 平級 Sibling 貨幣選擇彈窗 (z-[80]) */}
      <CurrencySelectDialog
        open={isCurrencyDialogOpen}
        onOpenChange={setIsCurrencyDialogOpen}
        selectedCurrency={currency}
        onSelectCurrency={setCurrency}
      />
    </>
  );
}

export interface CreateLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (newLedger: Ledger) => void;
}

export function CreateLedgerDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateLedgerDialogProps) {
  const { t, i18n } = useTranslation();
  const { addLedger } = useLedgers();
  const { setActiveLedgerId } = useAppStore();

  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerCurrency, setNewLedgerCurrency] = useState(
    i18n.language === 'zh-TW' ? 'TWD' : i18n.language === 'zh-CN' ? 'CNY' : 'USD'
  );
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);

  const handleCreateLedger = async () => {
    const trimmed = newLedgerName.trim();
    if (!trimmed) return;

    const newLedger = await addLedger(trimmed, newLedgerCurrency);
    setActiveLedgerId(newLedger.id);
    setNewLedgerName('');
    onOpenChange(false);
    toast.show(t('ledgers.createSuccess'));
    onCreated?.(newLedger);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[320px] max-w-[320px] p-5 gap-4 z-[70]"
          overlayClassName="z-[70]"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-primary" />
              <span>{t('dashboard.createLedger')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-1 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('ledgers.ledgerName')}
              </label>
              <Input
                placeholder={t('dashboard.newLedgerName')}
                value={newLedgerName}
                onChange={(e) => setNewLedgerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLedger()}
                className="h-10 text-sm font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('ledgers.baseCurrency')}
              </label>
              <CurrencyTrigger
                currency={newLedgerCurrency}
                onClick={() => setIsCurrencyDialogOpen(true)}
                className="w-full justify-between h-10"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:gap-2">
            <DialogClose render={<Button variant="ghost" type="button" className="cursor-pointer text-xs h-10" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button
              onClick={handleCreateLedger}
              disabled={!newLedgerName.trim()}
              className="cursor-pointer text-xs h-10 px-4"
            >
              {t('ledgers.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 平級 Sibling 貨幣選擇彈窗 (z-[80]) */}
      <CurrencySelectDialog
        open={isCurrencyDialogOpen}
        onOpenChange={setIsCurrencyDialogOpen}
        selectedCurrency={newLedgerCurrency}
        onSelectCurrency={setNewLedgerCurrency}
      />
    </>
  );
}

export interface DeleteLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: Ledger | null;
  onProceed: (ledger: Ledger) => void;
}

export function DeleteLedgerDialog({
  open,
  onOpenChange,
  ledger,
  onProceed,
}: DeleteLedgerDialogProps) {
  const { t } = useTranslation();
  const [confirmInput, setConfirmInput] = useState('');

  // 彈窗開啟或目標帳本變動時重設輸入內容
  useEffect(() => {
    if (open) {
      setConfirmInput('');
    }
  }, [open, ledger]);

  const targetName = ledger?.name || '';
  const isMatched = confirmInput.trim() === targetName;

  const handleSubmit = () => {
    if (!ledger || !isMatched) return;
    onProceed(ledger);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[340px] max-w-[340px] p-5 gap-4 z-[70]"
        overlayClassName="z-[70]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 text-destructive" />
            <span>{t('ledgers.deleteLedger')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('ledgers.deleteWarning')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          <label className="text-xs text-muted-foreground block">
            {t('ledgers.typeToConfirm')}{' '}
            <span className="font-mono text-destructive font-bold select-all bg-destructive/10 px-1 py-0.5 rounded">
              {targetName}
            </span>
          </label>
          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            className="font-mono h-10 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isMatched) {
                handleSubmit();
              }
            }}
          />
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:gap-2 pt-2">
          <DialogClose render={<Button variant="ghost" type="button" className="cursor-pointer text-xs h-10" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!isMatched}
            className="cursor-pointer text-xs h-10 px-4"
          >
            {t('ledgers.nextStep', '下一步')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
