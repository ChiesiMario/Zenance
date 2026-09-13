import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { User, Receipt } from 'lucide-react';
import type { Account, Transaction } from '@/services/db/db';

interface NoteInputWithMentionsProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function NoteInputWithMentions({
  value,
  onChange,
  placeholder,
  className,
  id = 'note',
}: NoteInputWithMentionsProps) {
  const { t } = useTranslation();
  const { allContacts } = useAccounts();
  const { transactions } = useTransactions();
  const { allCategories } = useCategories();
  const { ledgers } = useLedgers();
  const { activeLedgerId } = useAppStore();

  const activeLedger = useMemo(() => {
    return ledgers?.find(l => l.id === activeLedgerId);
  }, [ledgers, activeLedgerId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuMode, setMenuMode] = useState<'contact' | 'transaction' | null>(null);
  const [query, setQuery] = useState('');
  const [triggerIndex, setTriggerIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 聯絡人搜尋結果
  const filteredContacts = useMemo(() => {
    if (menuMode !== 'contact' || !allContacts) return [];
    const q = query.toLowerCase().trim();
    if (!q) return allContacts.slice(0, 8);
    return allContacts
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [menuMode, allContacts, query]);

  // 交易記錄搜尋結果
  const filteredTransactions = useMemo(() => {
    if (menuMode !== 'transaction' || !transactions) return [];
    const q = query.toLowerCase().trim();
    const sorted = transactions
      .filter(t => !t.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!q) return sorted.slice(0, 6);

    return sorted
      .filter(tx => {
        const displayId = (tx.displayId || tx.id.split('-')[0]).toLowerCase();
        const catName = allCategories?.find(c => c.id === tx.category)?.name?.toLowerCase() || '';
        const note = (tx.note || '').toLowerCase();
        const amountStr = String(tx.amount);
        return (
          displayId.includes(q) ||
          catName.includes(q) ||
          note.includes(q) ||
          amountStr.includes(q)
        );
      })
      .slice(0, 6);
  }, [menuMode, transactions, allCategories, query]);

  const activeItemsLength =
    menuMode === 'contact'
      ? filteredContacts.length
      : menuMode === 'transaction'
      ? filteredTransactions.length
      : 0;

  // 重設高亮索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [menuMode, query]);

  // 點擊外部關閉選單
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setMenuMode(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 檢查游標前文字，觸發或更新浮動選單
  const checkTrigger = (text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos);

    // 檢查 @
    const contactMatch = textBeforeCursor.match(/@([^\s@\[\]]*)$/);
    if (contactMatch) {
      setMenuMode('contact');
      setQuery(contactMatch[1]);
      setTriggerIndex(contactMatch.index ?? -1);
      return;
    }

    // 檢查 [[
    const txMatch = textBeforeCursor.match(/(?:\[\[#?)([A-Za-z0-9_-]*)$/);
    if (txMatch) {
      setMenuMode('transaction');
      setQuery(txMatch[1]);
      setTriggerIndex(txMatch.index ?? -1);
      return;
    }

    setMenuMode(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart ?? newText.length;
    onChange(newText);
    checkTrigger(newText, cursorPos);
  };

  // 插入聯絡人
  const insertContact = (contact: Account) => {
    if (triggerIndex < 0) return;
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const beforeTrigger = value.slice(0, triggerIndex);
    const afterCursor = value.slice(cursorPos);
    const replacement = `@${contact.name} `;
    const updatedValue = beforeTrigger + replacement + afterCursor;

    onChange(updatedValue);
    setMenuMode(null);

    // 回焦並設置游標
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = beforeTrigger.length + replacement.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  // 插入交易記錄
  const insertTransaction = (tx: Transaction) => {
    if (triggerIndex < 0) return;
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const beforeTrigger = value.slice(0, triggerIndex);
    const afterCursor = value.slice(cursorPos);
    const code = tx.displayId || tx.id.split('-')[0].toUpperCase();
    const replacement = `[[#${code}]] `;
    const updatedValue = beforeTrigger + replacement + afterCursor;

    onChange(updatedValue);
    setMenuMode(null);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = beforeTrigger.length + replacement.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  // 鍵盤導航控制
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!menuMode || activeItemsLength === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % activeItemsLength);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + activeItemsLength) % activeItemsLength);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (menuMode === 'contact' && filteredContacts[selectedIndex]) {
        insertContact(filteredContacts[selectedIndex]);
      } else if (menuMode === 'transaction' && filteredTransactions[selectedIndex]) {
        insertTransaction(filteredTransactions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMenuMode(null);
    }
  };

  return (
    <div className="relative w-full">
      {/* 浮動自動補全選單（向上彈出） */}
      {menuMode && activeItemsLength > 0 && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 mb-2 w-full max-h-56 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl overflow-y-auto p-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* 標題欄 */}
          <div className="px-2 py-1 text-[10px] uppercase tracking-widest font-mono text-zinc-400 border-b border-zinc-850 flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              {menuMode === 'contact' ? <User className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
              {menuMode === 'contact' ? t('contacts.contacts', '對象清單') : t('dashboard.recentTransactions', '近期交易')}
            </span>
            <span className="text-[9px] opacity-70">↑↓ 選擇 • Enter 確認</span>
          </div>

          {/* 聯絡人選項列表 */}
          {menuMode === 'contact' &&
            filteredContacts.map((contact, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => insertContact(contact)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-left cursor-pointer",
                    isSelected ? "bg-white/10 text-white font-medium" : "text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium text-primary">@{contact.name}</span>
                    {contact.group && (
                      <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-1 rounded">
                        {contact.group}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

          {/* 交易記錄選項列表 */}
          {menuMode === 'transaction' &&
            filteredTransactions.map((tx, idx) => {
              const isSelected = idx === selectedIndex;
              const displayCode = tx.displayId || tx.id.split('-')[0].toUpperCase();
              const category = allCategories?.find(c => c.id === tx.category);

              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => insertTransaction(tx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-left cursor-pointer",
                    isSelected ? "bg-white/10 text-white font-medium" : "text-zinc-300 hover:bg-white/5"
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-foreground bg-zinc-850 px-1 rounded font-medium">
                        #{displayCode}
                      </span>
                      <span className="truncate text-xs font-medium text-zinc-200">
                        {category?.name || t('common.uncategorized')}
                      </span>
                    </div>
                    {tx.note && (
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {tx.note}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-1">
                    <AmountDisplay
                      amount={tx.amount}
                      baseCurrency={activeLedger?.baseCurrency}
                      type={tx.type as any}
                      className="text-xs font-mono"
                    />
                    <span className="text-[9px] font-mono text-zinc-500">
                      {tx.date}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      )}

      {/* 備註輸入框 */}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full h-8 px-3 border border-white/10 bg-white/5 text-white shadow-none focus:outline-none focus:border-white/20 text-xs font-medium rounded-lg placeholder:text-zinc-500",
          className
        )}
      />
    </div>
  );
}
