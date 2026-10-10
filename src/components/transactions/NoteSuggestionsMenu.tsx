import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NoteSuggestionItem } from '@/hooks/useNoteSuggestions';

export interface NoteSuggestionsMenuProps {
  isOpen: boolean;
  suggestions: NoteSuggestionItem[];
  currentCategoryId?: string;
  onSelect: (item: NoteSuggestionItem) => void;
  onClose: () => void;
  activeIndex?: number;
  onHoverIndex?: (index: number) => void;
}

export function NoteSuggestionsMenu({
  isOpen,
  suggestions,
  currentCategoryId,
  onSelect,
  onClose,
  activeIndex = -1,
  onHoverIndex,
}: NoteSuggestionsMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 當 activeIndex 變化時自動滾動至可視區域
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < suggestions.length) {
      const activeEl = itemRefs.current[activeIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, suggestions.length]);

  // 點擊外部區域自動關閉
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full mb-1.5 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-none overflow-hidden animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* 標題欄 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/60 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-muted-foreground" />
          <span>{t('add.suggestionsTitle', '歷史備註與分類建議')}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={t('common.close', '關閉')}
        >
          <X className="size-3" />
        </button>
      </div>

      {/* 候選條目清單 */}
      <div className="divide-y divide-border/60 max-h-[190px] overflow-y-auto">
        {suggestions.map((item, index) => {
          const isSameCategory = item.categoryId && item.categoryId === currentCategoryId;
          const isActive = activeIndex === index;

          return (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              onMouseEnter={() => onHoverIndex?.(index)}
              onClick={() => onSelect(item)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer group',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted/40 active:bg-muted/60'
              )}
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="text-xs text-foreground font-medium truncate">
                  {item.note}
                </span>

                {item.categoryName && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border font-mono shrink-0 transition-colors',
                      isSameCategory
                        ? 'border-border bg-muted/40 text-muted-foreground'
                        : 'border-border bg-muted/80 text-foreground font-medium'
                    )}
                  >
                    {item.categoryName}
                  </span>
                )}
              </div>

              <div className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground shrink-0 transition-colors">
                <span>{t('add.suggestionUsageCount', { count: item.count })}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
