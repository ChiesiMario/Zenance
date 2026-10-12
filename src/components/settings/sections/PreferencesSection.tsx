import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/components/ThemeProvider';
import type { Category, Tag } from '@/services/db/db';

interface PreferencesSectionProps {
  categories?: Category[];
  archivedCategories?: Category[];
  tags?: Tag[];
  archivedTags?: Tag[];
  hidePwaInstallPrompt: boolean;
  onSetHidePwaInstallPrompt: (val: boolean) => void;
}

export function PreferencesSection({
  categories,
  archivedCategories,
  tags,
  archivedTags,
  hidePwaInstallPrompt,
  onSetHidePwaInstallPrompt,
}: PreferencesSectionProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
  const activeCount = categories?.length ?? 0;
  const archivedCount = archivedCategories?.length ?? 0;

  const getThemeLabel = (tVal: string) => {
    if (tVal === 'light') return t('settings.themeLight');
    if (tVal === 'dark') return t('settings.themeDark');
    return t('settings.themeSystem');
  };

  const getLanguageLabel = (lang: string) => {
    if (lang === 'zh-TW' || lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return '繁體中文';
    if (lang === 'zh-CN' || lang.startsWith('zh-CN') || lang.startsWith('zh-Hans')) return '简体中文';
    return 'English';
  };

  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1 mb-2">
        {t('settings.preferencesSection', '偏好設定')}
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
        {/* 外觀主題 */}
        <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
          <span className="text-sm font-normal text-foreground">{t('settings.theme')}</span>
          <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
            <SelectTrigger
              size="custom"
              className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <SelectValue className="flex-none text-right">
                {getThemeLabel(theme)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
              <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
              <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 介面語言 */}
        <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
          <span className="text-sm font-normal text-foreground">{t('settings.language')}</span>
          <Select
            value={currentLang}
            onValueChange={(v) => i18n.changeLanguage(v || 'en')}
          >
            <SelectTrigger
              size="custom"
              className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <SelectValue className="flex-none text-right">
                {getLanguageLabel(currentLang)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="zh-TW">繁體中文</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 收支分類管理 */}
        <Link
          to="/settings/categories"
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors group cursor-pointer"
        >
          <span className="text-sm font-normal text-foreground">{t('settings.manageCategories')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            <span>
              {t('settings.activeCount', { count: activeCount })}
              {archivedCount > 0 ? ` · ${t('settings.archivedCount', { count: archivedCount })}` : ''}
            </span>
            <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
        </Link>

        {/* 標籤管理 */}
        <Link
          to="/settings/tags"
          className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors group cursor-pointer"
        >
          <span className="text-sm font-normal text-foreground">{t('settings.manageTags', '標籤管理')}</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground">
            <span>
              {t('settings.activeCount', { count: (tags || []).length })}
              {(archivedTags || []).length > 0 ? ` · ${t('settings.archivedCount', { count: (archivedTags || []).length })}` : ''}
            </span>
            <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
        </Link>

        {/* 隱藏 PWA 安裝按鈕 */}
        <div className="h-12 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
          <span className="text-sm font-normal text-foreground">{t('settings.hidePwaInstallPrompt')}</span>
          <Switch
            checked={hidePwaInstallPrompt}
            onCheckedChange={onSetHidePwaInstallPrompt}
          />
        </div>
      </div>
    </div>
  );
}
