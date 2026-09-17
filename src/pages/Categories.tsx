import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, MoreVertical, Trash2, Edit2, Check, X, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Category } from '@/services/db/db';
import { cn } from '@/lib/utils';

export default function Categories() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { categories, addCategory, updateCategory, archiveCategory, deleteCategory } = useCategories();
  const { transactions } = useTransactions();
  
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const filteredCategories = categories?.filter(c => c.type === activeTab) || [];

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
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{t('settings.categories', '分類管理')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setIsAddDialogOpen(true)} className="text-foreground">
            <Plus className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => navigate('/settings/categories/archived')} className="text-muted-foreground hover:text-foreground">
            <Archive className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex bg-muted p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('expense')}
          className={cn("flex-1 text-sm font-medium py-1.5 rounded-md transition-colors", activeTab === 'expense' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
        >
          {t('add.expense')}
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={cn("flex-1 text-sm font-medium py-1.5 rounded-md transition-colors", activeTab === 'income' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
        >
          {t('add.income')}
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {filteredCategories.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noActivity')}
            </div>
          ) : (
            filteredCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 pl-4 group">
                {editingCategory?.id === cat.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)} 
                      className="h-8 flex-1"
                      autoFocus
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('nav.add', '新增分類')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="py-4">
            <Input 
              placeholder={t('dashboard.name', '分類名稱')} 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <DialogFooter className="mt-6">
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t('dashboard.close')}
              </DialogClose>
              <Button type="submit" disabled={!newName.trim()}>{t('dashboard.save', '儲存')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
