import { Button } from '@/components/ui/button';
import { Cloud, CloudOff, RefreshCw, Globe } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Settings() {
  const { isSyncing, lastSyncTime } = useAppStore();
  const { t, i18n } = useTranslation();
  const isAuthenticated = false; // Placeholder

  return (
    <div className="animate-in fade-in duration-500 w-full space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">{t('settings.settings')}</h2>
      
      {/* Dropbox Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        
        {/* Header row */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          {isAuthenticated ? <Cloud className="h-6 w-6 text-primary" /> : <CloudOff className="h-6 w-6 text-muted-foreground" />}
          <div>
            <h3 className="font-medium">{t('settings.dropboxSync')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.backupAndSync')}</p>
          </div>
        </div>

        {/* Status List */}
        <div className="divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <span className="text-sm font-medium">{t('settings.status')}</span>
            <span className={`text-sm ${isAuthenticated ? 'text-primary' : 'text-muted-foreground'}`}>
              {isAuthenticated ? t('settings.connected') : t('settings.disconnected')}
            </span>
          </div>
          
          {isAuthenticated && (
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium">{t('settings.lastSync')}</span>
              <span className="text-sm font-mono text-muted-foreground">{lastSyncTime || t('settings.never')}</span>
            </div>
          )}

          <div className="p-4 bg-muted/10">
            {!isAuthenticated ? (
              <Button className="w-full">
                {t('settings.connectDropbox')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={isSyncing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? t('settings.syncing') : t('settings.syncNow')}
                </Button>
                <Button variant="destructive" className="flex-1">
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preferences Container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 pl-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">{t('settings.language')}</span>
          </div>
          <Select value={i18n.resolvedLanguage || i18n.language || 'en'} onValueChange={(v) => i18n.changeLanguage(v || 'en')}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 bg-transparent text-right justify-end [&>span]:mr-2">
              <SelectValue placeholder={t('settings.selectLanguage')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-TW">繁體中文</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="text-center text-xs text-muted-foreground pt-4 font-mono">
        Zenance v1.0.0
      </div>
    </div>
  );
}
