import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, MoreVertical, Trash2, Edit2, Check, X, Archive, ChevronDown, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Category } from '@/services/db/db';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

export default function Categories() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { categories, archivedCategories, addCategory, updateCategory, archiveCategory, unarchiveCategory, deleteCategory } = useCategories();
  const { transactions } = useTransactions();
  
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived'>('active');
  
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  // 切換主 Tab 時自動回歸活躍標籤狀態
  const handleTabChange = (tab: 'expense' | 'income') => {
    setActiveTab(tab);
    setFilterStatus('active');
  };

  const currentCategories = useMemo(() => {
    if (filterStatus === 'archived') {
      return archivedCategories?.filter(c => c.type === activeTab) || [];
    }
    return categories?.filter(c => c.type === activeTab) || [];
  }, [categories, archivedCategories, activeTab, filterStatus]);

  const handleEditSubmit = async () => {
    if (editingCategory && editName.trim()) {
      await updateCategory(editingCategory.id, editName.trim());
      setEditingCategory(null);
    }
  };

  const handleDelete = async (cat: Category) => {
    await deleteCategory(cat.id);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      await addCategory(newName.trim(), activeTab);
      setNewName('');
      setIsAddDialogOpen(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{t('settings.categories', '分類管理')}</h2>
        </div>
        {filterStatus === 'active' ? (
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => setIsAddDialogOpen(true)} 
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('add.addCategory')}
          >
            <Plus className="h-5 w-5" />
          </Button>
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      <SegmentedControl<'expense' | 'income'>
        value={activeTab}
        onChange={handleTabChange}
        fullWidth
        options={[
          {
            value: 'expense',
            label: (
              <span className="flex items-center gap-1">
                <span>
                  {activeTab === 'expense' && filterStatus === 'archived'
                    ? t('settings.archived', '已歸檔')
                    : t('add.expense')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </span>
            ),
            dropdown: (
              <DropdownMenuContent align="start" sideOffset={6} className="min-w-[130px]">
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setFilterStatus('active')}
                >
                  <span>{t('add.expense')}</span>
                  {filterStatus === 'active' && activeTab === 'expense' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setFilterStatus('archived')}
                >
                  <span>{t('settings.archived', '已歸檔')}</span>
                  {filterStatus === 'archived' && activeTab === 'expense' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            ),
          },
          {
            value: 'income',
            label: (
              <span className="flex items-center gap-1">
                <span>
                  {activeTab === 'income' && filterStatus === 'archived'
                    ? t('settings.archived', '已歸檔')
                    : t('add.income')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </span>
            ),
            dropdown: (
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[130px]">
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setFilterStatus('active')}
                >
                  <span>{t('add.income')}</span>
                  {filterStatus === 'active' && activeTab === 'income' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setFilterStatus('archived')}
                >
                  <span>{t('settings.archived', '已歸檔')}</span>
                  {filterStatus === 'archived' && activeTab === 'income' && (
                    <Check className="h-3.5 w-3.5 ml-2" />
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            ),
          },
        ]}
      />

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {currentCategories.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {filterStatus === 'archived' ? t('settings.noArchivedCategories', '暫無已歸檔分類') : t('dashboard.noActivity')}
            </div>
          ) : (
            currentCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 pl-4 group">
                {filterStatus === 'archived' ? (
                  <>
                    <button 
                      className="flex-1 text-left font-medium text-sm text-muted-foreground hover:underline cursor-pointer"
                      onClick={() => navigate(`/settings/categories/${cat.id}`)}
                    >
                      {cat.name}
                    </button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-primary opacity-90 hover:opacity-100 cursor-pointer"
                      onClick={() => unarchiveCategory(cat.id)}
                    >
                      <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                      {t('settings.unarchive', '取消歸檔')}
                    </Button>
                  </>
                ) : editingCategory?.id === cat.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)} 
                      className="h-8 flex-1"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditSubmit();
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleEditSubmit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingCategory(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const hasTx = transactions?.some(t => !t.deleted && t.category === cat.id);
                      return (
                        <>
                          <button 
                            className="flex-1 text-left font-medium text-sm hover:underline cursor-pointer"
                            onClick={() => navigate(`/settings/categories/${cat.id}`)}
                          >
                            {cat.name}
                          </button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-[160px]">
                              <DropdownMenuItem onClick={() => {
                                setEditingCategory(cat);
                                setEditName(cat.name);
                              }}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                {t('dashboard.edit', '編輯')}
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                onClick={() => handleDelete(cat)}
                                disabled={hasTx}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('dashboard.delete', '刪除')}
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={() => archiveCategory(cat.id)}>
                                <Archive className="h-4 w-4 mr-2" />
                                {t('settings.archive', '歸檔')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>{t('add.addCategory')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-1">
            <Input 
              placeholder={t('add.newCategoryPlaceholder')} 
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t('dashboard.close')}
              </DialogClose>
              <Button type="submit" disabled={!newName.trim()}>{t('dashboard.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
