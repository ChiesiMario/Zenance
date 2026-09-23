import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Users, UserCheck, RotateCcw, Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import type { Account } from '@/services/db/db';

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
  contacts?: Account[];
}

interface SelectContactsModalProps {
  open: boolean;
  onClose: () => void;
  availableContacts: Account[];
  onConfirmAdd: (selectedContactIds: string[]) => void;
}

/** 獨立彈出的選擇對象次級視窗 */
function SelectContactsModal({
  open,
  onClose,
  availableContacts,
  onConfirmAdd,
}: SelectContactsModalProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 每次打開時重設選取狀態與搜尋
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearchQuery('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableContacts;
    return availableContacts.filter(c => c.name.toLowerCase().includes(q));
  }, [availableContacts, searchQuery]);

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    onConfirmAdd(Array.from(selectedIds));
    onClose();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-md animate-in fade-in-0 duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 獨立 Modal 窗口 */}
      <div
        className="relative z-10 w-full max-w-[300px] bg-card border border-border rounded-xl shadow-none flex flex-col max-h-[82vh] animate-in zoom-in-95 duration-150 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('add.selectContactsTitle', '選擇代付對象')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('add.selectContactsDesc', '勾選要加入本次分攤的對象')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-7 -mr-1 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* 搜尋工具列（修復圖示重疊，刪除全選按鈕） */}
        <div className="p-3 border-b border-border bg-muted/10">
          <div className="flex items-center w-full h-9 rounded-lg border border-border bg-background px-3 gap-2 focus-within:border-foreground transition-colors">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('add.searchToAdd', '搜尋要添加的對象...')}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none border-none p-0"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* 候選對象列表 */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.length > 0 ? (
            filtered.map(c => {
              const isSelected = selectedIds.has(c.id);
              const isOrg = c.group === 'organization';
              return (
                <div
                  key={c.id}
                  onClick={() => toggleContact(c.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 text-left transition-colors cursor-pointer select-none",
                    isSelected ? "bg-muted/30" : "hover:bg-muted/10"
                  )}
                >
                  <div
                    className={cn(
                      "size-4 rounded border flex items-center justify-center transition-colors shrink-0",
                      isSelected
                        ? "bg-foreground text-background border-foreground"
                        : "border-border hover:border-foreground/50"
                    )}
                  >
                    {isSelected && <Check className="size-3 stroke-[3]" />}
                  </div>

                  {/* 頭像（🏢/👤） */}
                  <ContactAvatar 
                    group={c.group} 
                    className="size-7" 
                    iconClassName="size-3.5 text-muted-foreground" 
                    title={c.name} 
                  />

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {isOrg ? t('add.contactTypeOrganization', '組織') : t('add.contactTypePersonal', '個人')}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground px-4">
              {availableContacts.length === 0
                ? t('add.allContactsAlreadyAdded', '所有對象皆已加入分攤')
                : t('add.noContactsAvailable', '暫無可添加的對象')}
            </div>
          )}
        </div>

        {/* 底部按鈕欄 */}
        <div className="p-3 border-t border-border bg-card flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 cursor-pointer"
          >
            {t('common.cancel', '取消')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="text-xs h-8 font-medium cursor-pointer"
          >
            {selectedIds.size > 0
              ? t('add.confirmAddWithCount', { count: selectedIds.size, defaultValue: `確認添加 (${selectedIds.size} 人)` })
              : t('add.confirmAdd', '確認添加')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
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

  // 尚未添加的候選對象（自動過濾已加入者）
  const availableContacts = useMemo(() => {
    return contacts.filter(c => !c.deleted && allocatedAmounts[c.id] === undefined);
  }, [contacts, allocatedAmounts]);

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

  // 批次添加對象至本次分攤（預設金額 0.00）
  const handleBatchAddContacts = (newContactIds: string[]) => {
    setAllocatedAmounts(prev => {
      const next = { ...prev };
      newContactIds.forEach(id => {
        if (next[id] === undefined) {
          next[id] = '0';
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
      [contactId]: val,
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
    if (isOverAllocated) return;

    const result: SplitItem[] = [];
    Object.entries(allocatedAmounts).forEach(([contactId, strVal]) => {
      const amt = parseFloat(strVal);
      if (!isNaN(amt) && amt > 0) {
        result.push({
          contactId,
          amount: Math.round(amt * 100) / 100,
        });
      }
    });

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
          overlayClassName="z-[70] bg-background/40 backdrop-blur-md"
          className="z-[70] max-w-[360px] sm:max-w-[360px] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border border-border shadow-none"
        >
          {/* Header */}
          <DialogHeader className="p-4 border-b border-border text-left">
            <DialogTitle className="text-base font-semibold">
              {t('add.splitAdvanceTitle', '代付')}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 金額概覽面板 (Flat Design) */}
            <div className="grid grid-cols-2 gap-px bg-border rounded-lg border border-border overflow-hidden">
              <div className="bg-card p-3 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('add.totalAmount', '消費總額')}
                </span>
                <span className="text-base font-mono font-semibold tracking-tight text-foreground truncate mt-1">
                  {currencySymbol}{totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="bg-card p-3 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('add.advancesTotal', '代付合計')}
                </span>
                <span className={cn(
                  "text-base font-mono font-semibold tracking-tight truncate mt-1",
                  isOverAllocated ? "text-destructive" : totalAdvance > 0 ? "text-amber-500" : "text-muted-foreground"
                )}>
                  {currencySymbol}{totalAdvance.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 超額提示 */}
            {isOverAllocated && (
              <p className="text-xs text-destructive font-medium px-1">
                {t('add.exceedTotalError', '代付總額不可超過消費總額')}
              </p>
            )}

            {/* 快捷平分按鈕列 */}
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
                  {t('add.resetSplit', '重設自費')}
                </Button>
              )}
            </div>

            {/* 對象分配清單區域 */}
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
                    <div className="w-24 text-right">
                      <span
                        className={cn(
                          "font-mono text-xs font-semibold",
                          selfExpense < 0 ? "text-destructive" : "text-foreground"
                        )}
                      >
                        {currencySymbol}{selfExpense.toFixed(2)}
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

                      {/* 右側：金額輸入框與移出按鈕 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground font-mono">{currencySymbol}</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={currentAmountStr}
                            onChange={(e) => handleAmountChange(cId, e.target.value)}
                            placeholder="0.00"
                            className="w-24 h-8 text-right text-xs font-mono font-medium border-border bg-background focus-visible:ring-1"
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

          {/* Footer */}
          <DialogFooter className="p-3 border-t border-border bg-card flex flex-row items-center justify-end gap-2 sm:justify-end">
            <DialogClose render={<Button variant="outline" size="sm" type="button" />}>
              {t('common.cancel', '取消')}
            </DialogClose>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={isOverAllocated}
              className="font-medium cursor-pointer"
            >
              {t('common.confirm', '確定')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 獨立彈出的選擇對象視窗 */}
      <SelectContactsModal
        open={isSelectModalOpen}
        onClose={() => setIsSelectModalOpen(false)}
        availableContacts={availableContacts}
        onConfirmAdd={handleBatchAddContacts}
      />
    </>
  );
}
