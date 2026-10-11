import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, MoreVertical, Trash2, Edit2, Archive, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
import { useTransactions } from '@/hooks/useTransactions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Tag } from '@/services/db/db';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function Tags() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tags, archivedTags, addTag, updateTag, archiveTag, unarchiveTag, deleteTag } = useTags();
  const { transactions } = useTransactions();
  
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived'>('active');
  
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [renameName, setRenameName] = useState('');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const currentTags = useMemo(() => {
    if (filterStatus === 'archived') {
      return archivedTags || [];
    }
    return tags || [];
  }, [tags, archivedTags, filterStatus]);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingTag && renameName.trim()) {
      await updateTag(renamingTag.id, renameName.trim());
      setIsRenameDialogOpen(false);
      setRenamingTag(null);
      setRenameName('');
    }
  };

  const handleDelete = async (tag: Tag) => {
    const res = await deleteTag(tag.id);
    if (!res.success && res.reason === 'has_transactions') {
      toast.show(t('settings.tagHasTransactionsCannotDelete', '此標籤存在交易記錄，無法刪除。'));
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      await addTag(newName.trim());
      setNewName('');
      setIsAddDialogOpen(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{t('settings.tags', '標籤管理')}</h2>
        </div>
        {filterStatus === 'active' ? (
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => setIsAddDialogOpen(true)} 
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('tags.addTag', '新增標籤')}
          >
            <Plus className="h-5 w-5" />
          </Button>
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      <SegmentedControl<'active' | 'archived'>
        value={filterStatus}
        onChange={setFilterStatus}
        fullWidth
        options={[
          {
            value: 'active',
            label: (
              <span className="flex items-center gap-1">
                <span>{t('tags.activeTags', '使用中')}</span>
              </span>
            ),
          },
          {
            value: 'archived',
            label: (
              <span className="flex items-center gap-1">
                <span>{t('settings.archived', '已歸檔')}</span>
              </span>
            ),
          },
        ]}
      />

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {currentTags.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {filterStatus === 'archived' ? t('tags.noArchivedTags', '暫無已歸檔標籤') : t('tags.noTagsAvailable', '暫無標籤')}
            </div>
          ) : (
            currentTags.map(tag => (
              <div key={tag.id} className="h-12 flex items-stretch justify-between transition-colors hover:bg-muted/40 group">
                {filterStatus === 'archived' ? (
                  <>
                    <button 
                      className="flex-1 flex items-center h-full pl-4 pr-2 text-left font-medium text-sm text-muted-foreground cursor-pointer min-w-0 select-none"
                      onClick={() => navigate(`/settings/tags/${tag.id}`)}
                    >
                      #{tag.name}
                    </button>
                    <div className="flex items-center h-full pr-3 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-primary opacity-90 hover:opacity-100 cursor-pointer"
                        onClick={() => unarchiveTag(tag.id)}
                      >
                        <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                        {t('settings.unarchive', '取消歸檔')}
                      </Button>
                    </div>
                  </>
                ) : (
                  (() => {
                    const hasTx = transactions?.some(t => !t.deleted && t.tagIds?.includes(tag.id));
                    return (
                      <>
                        <button 
                          className="flex-1 flex items-center h-full pl-4 pr-2 text-left font-medium text-sm cursor-pointer min-w-0 select-none"
                          onClick={() => navigate(`/settings/tags/${tag.id}`)}
                        >
                          #{tag.name}
                        </button>
                        <div className="flex items-center h-full pr-3 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="cursor-pointer"
                                onClick={() => {
                                  setRenamingTag(tag);
                                  setRenameName(tag.name);
                                  setIsRenameDialogOpen(true);
                                }}
                              >
                                <Edit2 className="h-4 w-4 mr-2" />
                                {t('common.rename', '重命名')}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="cursor-pointer"
                                onClick={() => archiveTag(tag.id)}
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                {t('settings.archive', '歸檔')}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className={cn(
                                  "cursor-pointer text-destructive focus:text-destructive",
                                  hasTx && "opacity-50"
                                )}
                                onClick={() => {
                                  if (hasTx) {
                                    toast.show(t('settings.tagHasTransactionsCannotDelete', '此標籤存在交易記錄，無法刪除。'));
                                    return;
                                  }
                                  handleDelete(tag);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 新增標籤 Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] w-[300px] max-w-[calc(100vw-32px)] sm:w-[300px] sm:max-w-[300px] bg-card border border-border text-card-foreground p-5"
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground text-base font-semibold">
              {t('tags.addTag', '新增標籤')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-2">
            <Input 
              placeholder={t('tags.newTagPlaceholder', '輸入標籤名稱...')} 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
            />
            <DialogFooter className="flex flex-row items-center justify-between gap-3 pt-2">
              <DialogClose render={<Button type="button" variant="outline" className="border-border" />}>
                {t('common.cancel')}
              </DialogClose>
              <Button type="submit" disabled={!newName.trim()}>
                {t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 重命名標籤 Dialog */}
      <Dialog 
        open={isRenameDialogOpen} 
        onOpenChange={(open) => {
          setIsRenameDialogOpen(open);
          if (!open) {
            setRenamingTag(null);
            setRenameName('');
          }
        }}
      >
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] w-[300px] max-w-[calc(100vw-32px)] sm:w-[300px] sm:max-w-[300px] bg-card border border-border text-card-foreground p-5"
        >
          <DialogHeader>
            <DialogTitle className="text-card-foreground text-base font-semibold">
              {t('tags.renameTag', '重命名標籤')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4 py-2">
            <Input 
              placeholder={t('tags.renameTagPlaceholder', '輸入標籤名稱...')} 
              value={renameName} 
              onChange={e => setRenameName(e.target.value)} 
            />
            <DialogFooter className="flex flex-row items-center justify-between gap-3 pt-2">
              <DialogClose render={<Button type="button" variant="outline" className="border-border" />}>
                {t('common.cancel')}
              </DialogClose>
              <Button 
                type="submit" 
                disabled={!renameName.trim() || renameName.trim() === renamingTag?.name}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
