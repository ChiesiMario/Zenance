import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, MoreVertical, Trash2, Edit2, Check, X, Archive, RefreshCcw, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTags } from '@/hooks/useTags';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Tag } from '@/services/db/db';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

export default function Tags() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tags, archivedTags, addTag, updateTag, archiveTag, unarchiveTag, deleteTag } = useTags();
  
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived'>('active');
  
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const currentTags = useMemo(() => {
    if (filterStatus === 'archived') {
      return archivedTags || [];
    }
    return tags || [];
  }, [tags, archivedTags, filterStatus]);

  const handleEditSubmit = async () => {
    if (editingTag && editName.trim()) {
      await updateTag(editingTag.id, editName.trim());
      setEditingTag(null);
    }
  };

  const handleDelete = async (tag: Tag) => {
    await deleteTag(tag.id);
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
              <div key={tag.id} className="flex items-center justify-between p-3 pl-4 group">
                {filterStatus === 'archived' ? (
                  <>
                    <button 
                      className="flex-1 text-left font-medium text-sm text-muted-foreground hover:underline cursor-pointer flex items-center gap-2"
                      onClick={() => navigate(`/settings/tags/${tag.id}`)}
                    >
                      <TagIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">#{tag.name}</span>
                    </button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-primary opacity-90 hover:opacity-100 cursor-pointer"
                      onClick={() => unarchiveTag(tag.id)}
                    >
                      <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                      {t('settings.unarchive', '取消歸檔')}
                    </Button>
                  </>
                ) : editingTag?.id === tag.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)} 
                      className="h-8 flex-1"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditSubmit();
                        if (e.key === 'Escape') setEditingTag(null);
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleEditSubmit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingTag(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button 
                      className="flex-1 text-left font-medium text-sm hover:underline cursor-pointer flex items-center gap-2"
                      onClick={() => navigate(`/settings/tags/${tag.id}`)}
                    >
                      <TagIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">#{tag.name}</span>
                    </button>
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
                            setEditingTag(tag);
                            setEditName(tag.name);
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => archiveTag(tag.id)}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          {t('settings.archive', '歸檔')}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onClick={() => handleDelete(tag)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
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
          className="z-[70] sm:max-w-[340px] bg-card border border-border text-card-foreground p-5"
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
    </div>
  );
}
