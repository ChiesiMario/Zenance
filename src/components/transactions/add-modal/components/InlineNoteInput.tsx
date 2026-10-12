import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { NoteSuggestionsMenu } from '@/components/transactions/NoteSuggestionsMenu';
import { useNoteSuggestions, type NoteSuggestionItem } from '@/hooks/useNoteSuggestions';
import type { Category, Transaction } from '@/services/db/db';
import type { TransactionType } from '../types';

interface InlineNoteInputProps {
  note: string;
  onChangeNote: (val: string) => void;
  type: TransactionType;
  selectedCategoryId?: string;
  selectedTagIds: string[];
  selectedTagNames: string[];
  allCategories?: Category[];
  categories?: Category[];
  transactions?: Transaction[];
  onOpenTagPicker: () => void;
  onSelectCategoryFromSuggestion?: (catId: string) => void;
}

export function InlineNoteInput({
  note,
  onChangeNote,
  type,
  selectedCategoryId,
  selectedTagIds,
  selectedTagNames,
  allCategories,
  categories,
  transactions,
  onOpenTagPicker,
  onSelectCategoryFromSuggestion,
}: InlineNoteInputProps) {
  const { t } = useTranslation();

  const [isNoteFocused, setIsNoteFocused] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [hasDismissedSuggestions, setHasDismissedSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const noteSuggestions = useNoteSuggestions({
    query: note,
    type,
    transactions: transactions || [],
    categories: allCategories || categories || [],
    maxSuggestions: 5,
  });

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [noteSuggestions]);

  useEffect(() => {
    if (isNoteFocused && note.trim() && noteSuggestions.length > 0 && !hasDismissedSuggestions) {
      setIsSuggestionsOpen(true);
    } else {
      setIsSuggestionsOpen(false);
    }
  }, [isNoteFocused, note, noteSuggestions.length, hasDismissedSuggestions]);

  const handleSelectSuggestion = (item: NoteSuggestionItem) => {
    triggerHaptic('light');
    onChangeNote(item.note);
    if (item.categoryId && onSelectCategoryFromSuggestion) {
      onSelectCategoryFromSuggestion(item.categoryId);
    }
    setIsSuggestionsOpen(false);
    setHasDismissedSuggestions(true);
    setActiveSuggestionIndex(-1);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSuggestionsOpen || noteSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        const next = prev + 1;
        return next >= noteSuggestions.length ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? noteSuggestions.length - 1 : next;
      });
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < noteSuggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(noteSuggestions[activeSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsSuggestionsOpen(false);
      setHasDismissedSuggestions(true);
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <div className="flex items-center gap-2 w-full">
      {/* 標籤呼出按鈕 (Tag Trigger Button) */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenTagPicker();
        }}
        className={cn(
          "h-10 sm:h-8 px-2.5 sm:px-2 rounded-xl border flex items-center justify-center gap-1 shrink-0 text-sm sm:text-xs font-mono transition-colors cursor-pointer",
          selectedTagIds.length > 0
            ? "bg-primary text-primary-foreground border-primary font-semibold"
            : "bg-muted/60 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
        )}
        title={t('tags.selectTags', '選擇標籤')}
      >
        <span className="font-bold">#</span>
        {selectedTagIds.length > 0 && (
          <span className="text-[11px] font-sans font-medium max-w-[80px] truncate">
            {selectedTagNames.length === 1 ? selectedTagNames[0] : selectedTagIds.length}
          </span>
        )}
      </button>

      {/* 內嵌備註輸入框與自動建議選單 */}
      <div className="relative flex-1 min-w-0">
        <NoteSuggestionsMenu
          isOpen={isSuggestionsOpen}
          suggestions={noteSuggestions}
          currentCategoryId={selectedCategoryId}
          activeIndex={activeSuggestionIndex}
          onHoverIndex={setActiveSuggestionIndex}
          onSelect={handleSelectSuggestion}
          onClose={() => {
            setIsSuggestionsOpen(false);
            setHasDismissedSuggestions(true);
            setActiveSuggestionIndex(-1);
          }}
        />

        <input
          id="note"
          type="text"
          placeholder={t('add.note', '填寫備註...')}
          value={note}
          onFocus={() => {
            setIsNoteFocused(true);
            setHasDismissedSuggestions(false);
          }}
          onBlur={() => {
            setTimeout(() => {
              setIsNoteFocused(false);
            }, 200);
          }}
          onKeyDown={handleNoteKeyDown}
          onChange={(e) => {
            onChangeNote(e.target.value);
            setIsNoteFocused(true);
            setHasDismissedSuggestions(false);
          }}
          className="w-full h-10 sm:h-8 px-3.5 sm:px-3 rounded-xl bg-muted/60 border border-border text-sm sm:text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
        />
      </div>
    </div>
  );
}
