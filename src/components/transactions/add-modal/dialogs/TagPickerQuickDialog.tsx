import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import type { Tag } from '@/services/db/db';

interface TagPickerQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  tags?: Tag[];
  onAddTag: (name: string) => Promise<Tag>;
  onTagCreated?: (newTagId: string) => void;
}

export function TagPickerQuickDialog({
  open,
  onOpenChange,
  selectedTagIds,
  onToggleTag,
  tags,
  onAddTag,
  onTagCreated,
}: TagPickerQuickDialogProps) {
  const { t } = useTranslation();
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const filteredTags = useMemo(() => {
    if (!tags) return [];
    const query = tagSearchQuery.trim().toLowerCase();
    if (!query) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [tags, tagSearchQuery]);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;

    const created = await onAddTag(trimmed);
    if (onTagCreated) {
      onTagCreated(created.id);
    }
    setNewTagName('');
    setIsCreateTagOpen(false);
  };

  return (
    <>
      {/* 標籤選擇彈窗 (平級 Sibling Portal 宣告，層級 z-[70]) */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) {
            setTagSearchQuery('');
          }
        }}
      >
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] w-[320px] max-w-[calc(100vw-32px)] sm:w-[320px] sm:max-w-[320px] bg-card border border-border text-card-foreground p-4"
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground text-base font-semibold">
              {t('tags.selectTags', '選擇標籤')}
            </DialogTitle>
          </DialogHeader>

          <div className="relative flex items-center w-full my-2">
            <Search className="size-4 text-muted-foreground absolute left-3 pointer-events-none" />
            <Input
              type="text"
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              placeholder={t('tags.searchPlaceholder', '搜尋標籤...')}
              className="w-full h-9 pl-9 pr-8 text-xs font-sans rounded-lg bg-muted/10 border-border placeholder:text-muted-foreground/60"
            />
            {tagSearchQuery && (
              <button
                type="button"
                onClick={() => setTagSearchQuery('')}
                className="absolute right-2.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 max-h-[220px] overflow-y-auto no-scrollbar py-2">
            {filteredTags.length === 0 && (
              <div className="w-full py-4 text-center text-xs text-muted-foreground">
                {tags?.length === 0
                  ? t('tags.noTagsAvailable', '暫無標籤')
                  : t('tags.noMatchingTags', '無匹配標籤')}
              </div>
            )}
            {filteredTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    onToggleTag(tag.id);
                  }}
                  className={cn(
                    "px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-medium shrink-0 transition-colors cursor-pointer border flex items-center gap-1",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "bg-muted/80 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}
                >
                  <span>#{tag.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setIsCreateTagOpen(true);
              }}
              className="px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs sm:text-[11px]">{t('tags.addTag', '新增標籤')}</span>
            </button>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end pt-2 [&>*:only-child]:ml-auto">
            <DialogClose render={<Button type="button" size="sm" className="h-8" />}>
              {t('common.done', '完成')}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增標籤三級彈窗 (平級 Sibling Portal 宣告，層級 z-[80]) */}
      <Dialog open={isCreateTagOpen} onOpenChange={setIsCreateTagOpen}>
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[80] sm:max-w-[320px] bg-card border border-border text-card-foreground p-4"
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground text-base">
              {t('tags.addTag', '新增標籤')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateTag} className="space-y-4 pt-2">
            <Input
              placeholder={t('tags.newTagPlaceholder', '輸入標籤名稱...')}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="h-9"
            />
            <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2">
              <DialogClose render={<Button type="button" variant="outline" className="h-8 border-border" />}>
                {t('common.cancel')}
              </DialogClose>
              <Button type="submit" disabled={!newTagName.trim()} className="h-8">
                {t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
