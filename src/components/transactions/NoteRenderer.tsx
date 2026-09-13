import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface NoteRendererProps {
  note?: string | null;
  className?: string;
}

export function NoteRenderer({ note, className }: NoteRendererProps) {
  const navigate = useNavigate();
  const { allContacts } = useAccounts();
  const { transactions } = useTransactions();
  const { setViewingTransactionId } = useAppStore();

  if (!note) return null;

  // 正則表達式：同時捕獲 @對象 與 [[#編號]]
  // Group 1: @對象名稱
  // Group 2: [[#編號]] 中的純編號
  const regex = /(@[^\s@\[\]]+)|(?:\[\[#?([A-Za-z0-9_-]+)\]\])/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(note)) !== null) {
    // 匹配前的普通文本
    if (match.index > lastIndex) {
      elements.push(note.slice(lastIndex, match.index));
    }

    const mentionMatch = match[1]; // 例如 "@張三"
    const wikiMatch = match[2];    // 例如 "3A8F"

    if (mentionMatch) {
      const contactName = mentionMatch.slice(1);
      const contact = allContacts?.find(
        c => c.name.toLowerCase() === contactName.toLowerCase()
      );

      elements.push(
        <button
          key={`mention-${match.index}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (contact) {
              navigate(`/contacts/${contact.id}`);
            }
          }}
          className={cn(
            "inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border leading-none mx-0.5 align-middle transition-colors",
            contact
              ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer"
              : "bg-muted text-muted-foreground border-border cursor-default"
          )}
          title={contact ? `查看聯絡人：${contact.name}` : contactName}
        >
          {mentionMatch}
        </button>
      );
    } else if (wikiMatch) {
      const code = wikiMatch.toUpperCase();
      const targetTx = transactions?.find(t => {
        const txDisplay = t.displayId || t.id.split('-')[0].toUpperCase();
        return txDisplay.toUpperCase() === code || t.id.toLowerCase().startsWith(code.toLowerCase());
      });

      elements.push(
        <button
          key={`wiki-${match.index}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (targetTx) {
              setViewingTransactionId(targetTx.id);
            }
          }}
          className={cn(
            "inline-flex items-center text-xs font-mono px-1.5 py-0.5 rounded border leading-none mx-0.5 align-middle transition-colors font-medium",
            targetTx
              ? "bg-muted/70 text-foreground border-border hover:border-foreground/40 hover:bg-muted cursor-pointer"
              : "bg-muted/30 text-muted-foreground border-dashed border-border cursor-default"
          )}
          title={targetTx ? `查看關聯交易：#${targetTx.displayId || code}` : `未找到交易 #${code}`}
        >
          [[#{targetTx?.displayId || code}]]
        </button>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // 尾部剩餘普通文字
  if (lastIndex < note.length) {
    elements.push(note.slice(lastIndex));
  }

  return (
    <span className={cn("inline-block break-words", className)}>
      {elements}
    </span>
  );
}
