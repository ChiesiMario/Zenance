import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/hooks/useCategories';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

export default function ArchivedCategories() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { archivedCategories, unarchiveCategory } = useCategories();
  
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  
  const filteredCategories = archivedCategories?.filter(c => c.type === activeTab) || [];

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2 cursor-pointer">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold tracking-tight">{t('contacts.archived', '已歸檔分類')}</h2>
      </div>

      <SegmentedControl<'expense' | 'income'>
        value={activeTab}
        onChange={setActiveTab}
        fullWidth
        options={[
          {
            value: 'expense',
            label: t('add.expense'),
          },
          {
            value: 'income',
            label: t('add.income'),
          },
        ]}
      />

      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="divide-y divide-border">
          {filteredCategories.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noActivity')}
            </div>
          ) : (
            filteredCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 pl-4 group">
                <button 
                  className="flex-1 text-left font-medium text-sm text-muted-foreground hover:underline cursor-pointer"
                  onClick={() => navigate(`/settings/categories/${cat.id}`)}
                >
                  {cat.name}
                </button>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  onClick={() => unarchiveCategory(cat.id)}
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  {t('settings.unarchive', '取消歸檔')}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
