import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/AmountInput';
import { Plus, Users, UserCheck, RotateCcw, X, Receipt } from 'lucide-react';
import { cn, sanitizeAmountInput, formatAmountNumber } from '@/lib/utils';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { AccountSelectDialog } from '@/components/accounts/AccountSelectDialog';
import { toast } from '@/components/ui/toast';
import type { Contact } from '@/services/db/db';

export interface SplitItem {
  contactId: string;
  amount: number;
}

interface SplitAdvanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number;
  currencySymbol?: string;
  splits: SplitItem[];
  onConfirm: (newSplits: SplitItem[]) => void;
  contacts?: Contact[];
}



export function SplitAdvanceDialog({
  open,
  onOpenChange,
  totalAmount,
  currencySymbol = '¥',
  splits,
  onConfirm,
  contacts = [],
}: SplitAdvanceDialogProps) {
  const { t } = useTranslation();

  // 暫存各人代付金額 (contactId -> amountString)
  const [allocatedAmounts, setAllocatedAmounts] = useState<Record<string, string>>({});
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  // 開啟彈窗時從外部 splits 同步
  useEffect(() => {
    if (open) {
      const map: Record<string, string> = {};
      splits.forEach(item => {
        if (item.contactId) {
          map[item.contactId] = item.amount > 0 ? item.amount.toString() : '0';
        }
      });
      setAllocatedAmounts(map);
      setIsSelectModalOpen(false);
    }
  }, [open, splits]);

  // 已選擇的對象 ID 清單
  const selectedContactIds = useMemo(() => {
    return Object.keys(allocatedAmounts);
  }, [allocatedAmounts]);

  // 各人代付總額
  const totalAdvance = useMemo(() => {
    const sum = Object.values(allocatedAmounts).reduce((acc, val) => {
      const parsed = parseFloat(val);
      return acc + (isNaN(parsed) || parsed < 0 ? 0 : parsed);
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [allocatedAmounts]);

  // 我的自費支出
  const selfExpense = useMemo(() => {
    return Math.round((totalAmount - totalAdvance) * 100) / 100;
  }, [totalAmount, totalAdvance]);

  // 是否超額
  const isOverAllocated = totalAdvance > totalAmount + 0.0001;

  // 批次添加對象至本次分攤（若原本為空且僅加入 1 位，預設全額代付）
  const handleBatchAddContacts = (newContactIds: string[]) => {
    setAllocatedAmounts(prev => {
      const next = { ...prev };
      const currentKeys = Object.keys(prev);
      const shouldAutoFill = currentKeys.length === 0 && newContactIds.length === 1 && totalAmount > 0;

      newContactIds.forEach(id => {
        if (next[id] === undefined) {
          next[id] = shouldAutoFill ? totalAmount.toFixed(2) : '0';
        }
      });
      return next;
    });
  };

  // 移出對象
  const handleRemoveContact = (contactId: string) => {
    setAllocatedAmounts(prev => {
      const next = { ...prev };
      delete next[contactId];
      return next;
    });
  };

  // 修改特定對象金額
  const handleAmountChange = (contactId: string, val: string) => {
    setAllocatedAmounts(prev => ({
      ...prev,
      [contactId]: sanitizeAmountInput(val),
    }));
  };

  // 快捷操作 1：全員平分（含自己）
  const handleSplitAll = () => {
    const count = selectedContactIds.length;
    if (count === 0 || totalAmount <= 0) return;

    // 總人數 = 選中對象數 + 1 (自己)
    const totalPeople = count + 1;
    const basePerPerson = Math.floor((totalAmount / totalPeople) * 100) / 100;

    const next: Record<string, string> = {};
    selectedContactIds.forEach(id => {
      next[id] = basePerPerson.toFixed(2);
    });
    setAllocatedAmounts(next);
  };

  // 快捷操作 2：僅對象平分（自己支出 0）
  const handleSplitContactsOnly = () => {
    const count = selectedContactIds.length;
    if (count === 0 || totalAmount <= 0) return;

    const basePerPerson = Math.floor((totalAmount / count) * 100) / 100;
    let remainder = Math.round((totalAmount - basePerPerson * count) * 100) / 100;

    const next: Record<string, string> = {};
    selectedContactIds.forEach((id, index) => {
      let amount = basePerPerson;
      if (index === 0 && remainder > 0) {
        amount = Math.round((amount + remainder) * 100) / 100;
        remainder = 0;
      }
      next[id] = amount.toFixed(2);
    });
    setAllocatedAmounts(next);
  };

  // 快捷操作 3：重設自費（金額歸零，保留名單）
  const handleReset = () => {
    setAllocatedAmounts(prev => {
      const next: Record<string, string> = {};
      Object.keys(prev).forEach(id => {
        next[id] = '0';
      });
      return next;
    });
  };

  // 確認送出
  const handleConfirm = () => {
    if (isOverAllocated) {
      toast(t('add.exceedTotalError', '代付總額不可超過消費總額。'));
      return;
    }

    let result: SplitItem[] = [];
    Object.entries(allocatedAmounts).forEach(([contactId, strVal]) => {
      const amt = parseFloat(strVal);
      if (!isNaN(amt) && amt > 0) {
        result.push({
          contactId,
          amount: Math.round(amt * 100) / 100,
        });
      }
    });

    // 若有選取單一對象但金額為 0，且有總消費金額，自動以全額代付確認
    if (result.length === 0 && selectedContactIds.length === 1 && totalAmount > 0) {
      result = [{
        contactId: selectedContactIds[0],
        amount: Math.round(totalAmount * 100) / 100,
      }];
    }

    onConfirm(result);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (!nextOpen && eventDetails?.reason === 'outside-press') {
            return;
          }
          onOpenChange(nextOpen);
        }}
        disablePointerDismissal
      >
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] sm:max-w-[350px] max-w-[350px] p-5 gap-4"
        >
          {/* Header (1:1 復刻 AccountFormDialog / BudgetFormDialog) */}
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              <span>{t('add.splitAdvanceTitle', '代付')}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Body (1:1 復刻 AccountFormDialog / BudgetFormDialog) */}
          <div className="space-y-4 py-1 overflow-y-auto max-h-[70vh] pr-0.5 overscroll-contain">
            {/* 1. 金額概覽面板 (Flat Design) */}
            <div className="grid grid-cols-2 gap-px bg-border rounded-lg border border-border overflow-hidden">
              <div className="bg-card p-3 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('add.totalAmount', '消費總額')}
                </span>
                <span className="text-base font-mono font-semibold tracking-tight text-foreground truncate mt-1">
                  {currencySymbol}{formatAmountNumber(totalAmount)}
                </span>
              </div>
              <div className="bg-card p-3 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('add.advancesTotal', '代付合計')}
                </span>
                <span className={cn(
                  "text-base font-mono font-semibold tracking-tight truncate mt-1",
                  isOverAllocated ? "text-rose-500" : totalAdvance > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  {currencySymbol}{formatAmountNumber(totalAdvance)}
                </span>
              </div>
            </div>

            {/* 2. 快捷平分按鈕列 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedContactIds.length === 0 || totalAmount <= 0}
                onClick={handleSplitAll}
                className="text-xs h-8 px-2.5 rounded-lg border-border hover:bg-muted font-normal cursor-pointer"
              >
                <Users className="size-3.5 mr-1 text-muted-foreground" />
                {t('add.splitAll', '全員平分')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedContactIds.length === 0 || totalAmount <= 0}
                onClick={handleSplitContactsOnly}
                className="text-xs h-8 px-2.5 rounded-lg border-border hover:bg-muted font-normal cursor-pointer"
              >
                <UserCheck className="size-3.5 mr-1 text-muted-foreground" />
                {t('add.splitContactsOnly', '對象平分')}
              </Button>
              {selectedContactIds.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-xs h-8 px-2 rounded-lg text-muted-foreground hover:text-foreground ml-auto cursor-pointer"
                >
                  <RotateCcw className="size-3.5 mr-1" />
                  {t('add.resetSplit', '重設')}
                </Button>
              )}
            </div>

            {/* 3. 對象分配清單區域 */}
            <div className="space-y-2.5">
              <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
                {/* 固定第一項：我（自費支出，自動連動） */}
                <div className="flex items-center justify-between p-3 gap-3 bg-muted/20">
                  {/* 左側：頭像與資訊 */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* 圓形首字頭像（黑底白字） */}
                    <div className="size-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold shrink-0">
                      {t('add.me', '我').charAt(0)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate text-foreground">
                        {t('add.me', '我')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {t('add.personalExpense', '自費支出')}
                      </span>
                    </div>
                  </div>

                  {/* 右側：金額（唯讀自動連動計算，對齊下方輸入框） */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-28 text-right pr-2">
                      <span
                        className={cn(
                          "font-mono text-xs font-semibold",
                          selfExpense < 0 ? "text-rose-500" : "text-foreground"
                        )}
                      >
                        {currencySymbol}{formatAmountNumber(selfExpense)}
                      </span>
                    </div>
                    {/* 佔位空間保持與移出按鈕對齊 */}
                    <div className="size-8 shrink-0" />
                  </div>
                </div>

                {/* 動態添加的代付對象列表 */}
                {selectedContactIds.map(cId => {
                  const c = contacts.find(item => item.id === cId);
                  const isOrg = c?.group === 'organization';
                  const currentAmountStr = allocatedAmounts[cId] ?? '';

                  return (
                    <div
                      key={cId}
                      className="flex items-center justify-between p-3 gap-3 bg-card hover:bg-muted/10 transition-colors"
                    >
                      {/* 左側：頭像與資訊 */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* 頭像（🏢/👤） */}
                        <ContactAvatar 
                          group={c?.group} 
                          className="size-7" 
                          iconClassName="size-3.5 text-muted-foreground" 
                          title={c?.name} 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium truncate text-foreground">
                            {c?.name || cId}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {isOrg ? t('add.contactTypeOrganization', '組織') : t('add.contactTypePersonal', '個人')}
                          </span>
                        </div>
                      </div>

                      {/* 右側：金額輸入框與移出按鈕（1:1 對齊新增預算金額輸入框設計標準） */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative flex items-center">
                          <span className="absolute left-2.5 text-xs font-mono font-medium text-muted-foreground pointer-events-none select-none">
                            {currencySymbol}
                          </span>
                          <AmountInput
                            placeholder="0.00"
                            value={currentAmountStr}
                            onValueChange={(val) => handleAmountChange(cId, val)}
                            currencySymbol={currencySymbol}
                            className="w-28 h-8 text-xs font-mono font-medium border-border bg-background focus-visible:ring-1"
                            style={{
                              paddingLeft: `${Math.max(1.75, 0.75 + currencySymbol.length * 0.5)}rem`,
                            }}
                          />
                        </div>

                        {/* 移出按鈕 */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveContact(cId)}
                          title={t('add.removeContactFromSplit', '移出')}
                          className="size-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 清單底部常駐：添加對象按鈕（點擊彈出獨立選擇窗口） */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSelectModalOpen(true)}
                className="w-full h-9 border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>{t('add.addContactToSplit', '添加對象')}</span>
              </Button>
            </div>
          </div>

          {/* Footer (1:1 復刻 AccountFormDialog / BudgetFormDialog) */}
          <DialogFooter className="flex flex-row items-center justify-between gap-3 sm:gap-3 pt-1">
            <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
              {t('common.cancel', '取消')}
            </DialogClose>
            <Button
              type="button"
              onClick={handleConfirm}
              className="cursor-pointer"
            >
              {t('common.confirm', '確定')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 獨立彈出的對象選擇視窗 (沿用全站標準 AccountSelectDialog) */}
      <AccountSelectDialog
        open={isSelectModalOpen}
        onOpenChange={setIsSelectModalOpen}
        title={t('add.selectContactsTitle', '選擇代付對象')}
        filterType="contact"
        overlayClassName="z-[80]"
        className="z-[80]"
        disabledAccountIds={selectedContactIds}
        disabledReason={t('add.alreadyAddedToSplit', '已在名單中')}
        onSelectAccount={(account) => {
          handleBatchAddContacts([account.id]);
          setIsSelectModalOpen(false);
        }}
      />
    </>
  );
}
