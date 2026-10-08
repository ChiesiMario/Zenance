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
import { Switch } from '@/components/ui/switch';
import { AmountInput } from '@/components/ui/AmountInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyTrigger } from '@/components/currency/CurrencyTrigger';
import { CurrencySelectDialog } from '@/components/currency/CurrencySelectDialog';
import { useAccounts } from '@/hooks/useAccounts';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { Wallet, CreditCard } from 'lucide-react';
import type { Wallet as WalletType } from '@/services/db/db';

export interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  account?: WalletType | null;
  hasTransactions?: boolean;
  onSuccess?: (account: WalletType) => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

export const GROUP_I18N_KEYS: Record<string, string> = {
  cash: 'groupCash',
  debit: 'groupDebit',
  credit: 'groupCredit',
  credit_pay: 'groupCreditPay',
  investment: 'groupInvestment',
  other: 'groupOther',
};

export function AccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
  hasTransactions = false,
  onSuccess,
  onDeleted,
  onArchived,
}: AccountFormDialogProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { accounts, addAccount, updateAccount, archiveAccount, unarchiveAccount, deleteAccount } = useAccounts();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();
  const activeLedger = ledgers?.find((l) => l.id === activeLedgerId);

  // Form states
  const [name, setName] = useState('');
  const [group, setGroup] = useState('cash');
  const [currency, setCurrency] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [excludeFromStats, setExcludeFromStats] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);

  const isCredit = group === 'credit' || group === 'credit_pay';

  // Sync state when dialog opens or account changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && account) {
        setName(account.name || '');
        setGroup(account.group || 'cash');
        setCurrency(account.currency || activeLedger?.baseCurrency || 'CNY');
        setInitialBalance(account.initialBalance !== undefined ? String(account.initialBalance) : '');
        setCreditLimit(account.creditLimit !== undefined ? String(account.creditLimit) : '');
        setStatementDay(account.statementDay !== undefined ? String(account.statementDay) : '');
        setDueDay(account.dueDay !== undefined ? String(account.dueDay) : '');
        setExcludeFromStats(Boolean(account.excludeFromStats));
        setIsDefault(Boolean(account.isDefault));
      } else {
        setName('');
        setGroup('cash');
        setCurrency(activeLedger?.baseCurrency || 'CNY');
        setInitialBalance('');
        setCreditLimit('');
        setStatementDay('');
        setDueDay('');
        setExcludeFromStats(false);
        setIsDefault(!accounts || accounts.length === 0);
      }
    }
  }, [open, mode, account, activeLedger?.baseCurrency, accounts]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const limitNum = parseFloat(creditLimit);
    const stmtDayNum = parseInt(statementDay, 10);
    const dueDayNum = parseInt(dueDay, 10);

    const creditFields = isCredit
      ? {
          creditLimit: isNaN(limitNum) ? undefined : limitNum,
          statementDay: isNaN(stmtDayNum) ? undefined : stmtDayNum,
          dueDay: isNaN(dueDayNum) ? undefined : dueDayNum,
        }
      : {
          creditLimit: undefined,
          statementDay: undefined,
          dueDay: undefined,
        };

    if (mode === 'create') {
      const balanceNum = parseFloat(initialBalance);
      const newAcc = await addAccount(
        trimmedName,
        'wallet',
        isNaN(balanceNum) ? 0 : balanceNum,
        currency || activeLedger?.baseCurrency || 'CNY',
        group,
        {
          ...creditFields,
          excludeFromStats: excludeFromStats ? true : undefined,
          isDefault,
        }
      );
      if (newAcc) {
        onSuccess?.(newAcc as WalletType);
      }
    } else if (mode === 'edit' && account) {
      await updateAccount(account.id, {
        name: trimmedName,
        group,
        currency,
        ...creditFields,
        excludeFromStats: excludeFromStats ? true : undefined,
        isDefault,
      });
      onSuccess?.({
        ...account,
        name: trimmedName,
        group,
        currency,
        ...creditFields,
        excludeFromStats,
        isDefault,
      });
    }

    onOpenChange(false);
  };

  const handleArchiveToggle = async () => {
    if (!account) return;
    if (account.archived) {
      await unarchiveAccount(account.id);
    } else {
      await archiveAccount(account.id);
    }
    onArchived?.();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!account) return;
    if (hasTransactions) {
      toast(t('accounts.cannotDeleteHasTransactions'));
      return;
    }

    const confirmed = await confirm({
      title: t('accounts.deleteAccount'),
      description: t('accounts.deleteAccountConfirm'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });

    if (!confirmed) return;

    const res = await deleteAccount(account.id);
    if (!res.success) {
      toast(
        res.reason === 'has_transactions'
          ? t('accounts.cannotDeleteHasTransactions')
          : t('common.error')
      );
    } else {
      onDeleted?.();
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[300px] max-w-[300px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              <span>{mode === 'create' ? t('accounts.addAccount') : t('accounts.editAccount')}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1 overflow-y-auto max-h-[70vh] pr-0.5 overscroll-contain">
            {/* 帳戶名稱 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('accounts.accountName')}
              </label>
              <Input
                placeholder={t('accounts.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleSubmit()}
                className="h-10 text-sm"
              />
            </div>

            {/* 帳戶分類與預設貨幣（50/50 分佈） */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                {/* 帳戶分類 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
                    {t('accounts.accountGroup')}
                  </label>
                  <Select value={group} onValueChange={(val) => val && setGroup(val)}>
                    <SelectTrigger className="w-full h-10 text-sm">
                      <SelectValue>
                        {t(`accounts.${GROUP_I18N_KEYS[group]}` as any)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('accounts.groupCash')}</SelectItem>
                      <SelectItem value="debit">{t('accounts.groupDebit')}</SelectItem>
                      <SelectItem value="credit">{t('accounts.groupCredit')}</SelectItem>
                      <SelectItem value="credit_pay">{t('accounts.groupCreditPay')}</SelectItem>
                      <SelectItem value="investment">{t('accounts.groupInvestment')}</SelectItem>
                      <SelectItem value="other">{t('accounts.groupOther')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 預設貨幣 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
                    {t('accounts.currency')}
                  </label>
                  <CurrencyTrigger
                    currency={currency || activeLedger?.baseCurrency || 'CNY'}
                    onClick={() => {
                      if (mode === 'edit' && hasTransactions) {
                        toast(t('accounts.cannotEditCurrencyHasTransactions'));
                        return;
                      }
                      setIsCurrencyDialogOpen(true);
                    }}
                    variant="button"
                    className={cn(
                      "w-full h-10 px-2.5",
                      mode === 'edit' && hasTransactions && "opacity-60 cursor-pointer"
                    )}
                    showName
                  />
                </div>
              </div>
            </div>

            {/* 初始金額（僅新增模式呈現） */}
            {mode === 'create' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('accounts.initialBalance')}
                </label>
                <AmountInput
                  className="font-mono w-full h-10"
                  placeholder="0.00"
                  value={initialBalance}
                  onValueChange={setInitialBalance}
                  allowNegative
                  onSubmitAmount={handleSubmit}
                />
              </div>
            )}

            {/* 信用卡 / 信用支付專屬配置區塊（對齊應用程式鎖安全性設定風格） */}
            {isCredit && (
              <div className="p-3.5 rounded-lg border border-border bg-muted/10 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <CreditCard className="size-3.5 text-primary" />
                  <span>{t('accounts.creditCardSettings')}</span>
                </div>

                {/* 信用額度 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('accounts.creditLimit')}
                  </label>
                  <AmountInput
                    className="h-9 font-mono"
                    placeholder={t('accounts.limitPlaceholder')}
                    value={creditLimit}
                    onValueChange={setCreditLimit}
                    onSubmitAmount={handleSubmit}
                  />
                </div>

                {/* 帳單日與還款日 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('accounts.statementDay')}
                    </label>
                    <Select
                      value={statementDay || 'none'}
                      onValueChange={(val) => setStatementDay(!val || val === 'none' ? '' : val)}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue placeholder={t('accounts.notSet')}>
                          {statementDay ? t('accounts.dayOfMonth', { day: statementDay }) : t('accounts.notSet')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        <SelectItem value="none">{t('accounts.notSet')}</SelectItem>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {t('accounts.dayOfMonth', { day: d })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('accounts.dueDay')}
                    </label>
                    <Select
                      value={dueDay || 'none'}
                      onValueChange={(val) => setDueDay(!val || val === 'none' ? '' : val)}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue placeholder={t('accounts.notSet')}>
                          {dueDay ? t('accounts.dayOfMonth', { day: dueDay }) : t('accounts.notSet')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        <SelectItem value="none">{t('accounts.notSet')}</SelectItem>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {t('accounts.dayOfMonth', { day: d })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* 帳戶屬性配置區塊（預設帳戶與排除統計） */}
            <div className="rounded-lg border border-border divide-y divide-border bg-card overflow-hidden">
              {/* 預設帳戶 */}
              <div
                onClick={() => setIsDefault(!isDefault)}
                className="p-3 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-medium text-foreground block">
                    {t('accounts.defaultAccount')}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {t('accounts.defaultAccountDesc')}
                  </p>
                </div>
                <Switch
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('accounts.defaultAccount')}
                />
              </div>

              {/* 排除資產統計 */}
              <div
                onClick={() => setExcludeFromStats(!excludeFromStats)}
                className="p-3 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-medium text-foreground block">
                    {t('accounts.excludeFromStats')}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {t('accounts.excludeFromStatsDesc')}
                  </p>
                </div>
                <Switch
                  checked={excludeFromStats}
                  onCheckedChange={setExcludeFromStats}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('accounts.excludeFromStats')}
                />
              </div>
            </div>

            {/* 帳戶管理動作（僅編輯模式展示：歸檔 / 刪除） */}
            {mode === 'edit' && account && (
              <div className="rounded-lg border border-border grid grid-cols-2 divide-x divide-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={handleArchiveToggle}
                  className="h-10 flex items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer select-none px-2 text-center"
                >
                  <span>
                    {account.archived ? t('settings.unarchive', '取消歸檔') : t('accounts.archiveAccount')}
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
                  <span>{t('accounts.deleteAccount')}</span>
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

      {/* 次級幣種選擇彈窗：平級兄弟節點聲明，層級提升至 z-[70] */}
      <CurrencySelectDialog
        open={isCurrencyDialogOpen}
        onOpenChange={setIsCurrencyDialogOpen}
        selectedCurrency={currency || activeLedger?.baseCurrency || 'CNY'}
        onSelectCurrency={(c) => {
          setCurrency(c);
          setIsCurrencyDialogOpen(false);
        }}
        overlayClassName="z-[70]"
        className="z-[70]"
      />
    </>
  );
}
