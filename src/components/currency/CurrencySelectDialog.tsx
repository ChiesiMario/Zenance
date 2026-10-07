import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ALL_CURRENCIES,
  POPULAR_CURRENCIES,
} from '@/lib/currencies';

export interface CurrencySelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
  title?: string;
  className?: string;
  overlayClassName?: string;
}

type RegionFilter = 'popular' | 'asia' | 'europe' | 'americas' | 'all';

export const CurrencySelectDialog: React.FC<CurrencySelectDialogProps> = ({
  open,
  onOpenChange,
  selectedCurrency,
  onSelectCurrency,
  title,
  className,
  overlayClassName,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRegion, setActiveRegion] = useState<RegionFilter>('popular');
  const [tempSelected, setTempSelected] = useState(selectedCurrency || 'USD');

  // 當彈窗開啟時同步外部選中值並重置搜尋狀態
  useEffect(() => {
    if (open) {
      setTempSelected(selectedCurrency || 'USD');
      setSearchQuery('');
      // 若當前幣種不是熱門幣種，預設標籤切換至 'all' 以便用戶看見其當前選中項
      const isPopular = POPULAR_CURRENCIES.some(
        (c) => c.code === (selectedCurrency || 'USD')
      );
      setActiveRegion(isPopular ? 'popular' : 'all');
    }
  }, [open, selectedCurrency]);

  const regionTabs: { key: RegionFilter; labelKey: string }[] = [
    { key: 'popular', labelKey: 'currencySelector.popular' },
    { key: 'asia', labelKey: 'currencySelector.asia' },
    { key: 'europe', labelKey: 'currencySelector.europe' },
    { key: 'americas', labelKey: 'currencySelector.americas' },
    { key: 'all', labelKey: 'currencySelector.all' },
  ];

  // 過濾邏輯
  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_CURRENCIES.filter((c) => {
      // 搜尋條件
      if (q) {
        const localizedName = t(c.i18nKey).toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const nameMatch = localizedName.includes(q);
        const symbolMatch = c.symbol.toLowerCase().includes(q);
        return codeMatch || nameMatch || symbolMatch;
      }

      // 分類條件
      if (activeRegion === 'all') return true;
      if (activeRegion === 'popular') return c.region === 'popular';
      return c.region === activeRegion;
    });
  }, [searchQuery, activeRegion, t]);

  const handleConfirm = () => {
    onSelectCurrency(tempSelected);
    onOpenChange(false);
  };

  const handleSelectRow = (code: string) => {
    setTempSelected(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={cn('z-[70]', overlayClassName)}
        className={cn(
          'z-[70] w-full max-w-[380px] sm:max-w-[380px] h-[540px] max-h-[85vh] max-h-[85dvh] p-0 sm:p-0 flex flex-col gap-0 overflow-hidden bg-card border border-border text-card-foreground shadow-none select-none rounded-2xl',
          className
        )}
      >
        {/* Top Control Section: Header + Search + Tabs */}
        <div data-slot="dialog-header" className="shrink-0 flex flex-col">
          {/* Header: Title & Single Close Button */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-border">
            <DialogHeader className="p-0 pb-0 shrink-0">
              <DialogTitle className="text-xs font-mono font-bold tracking-widest text-foreground uppercase">
                {title || t('currencySelector.title', '選擇貨幣')}
              </DialogTitle>
            </DialogHeader>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-border">
            <div className="relative flex items-center w-full">
              <Search className="size-4 text-muted-foreground absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  'currencySelector.searchPlaceholder',
                  '搜尋貨幣代碼或名稱...'
                )}
                className="w-full h-9 pl-9 pr-8 text-xs font-sans rounded-lg bg-muted/20 border border-border text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Category Tabs (僅在非主動搜尋時顯示) */}
            {!searchQuery && (
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
                {regionTabs.map((tab) => {
                  const isActive = activeRegion === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveRegion(tab.key)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap cursor-pointer select-none',
                        isActive
                          ? 'bg-foreground text-background font-semibold'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-border/50'
                      )}
                    >
                      {t(tab.labelKey)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Currency List (唯一的 flex-1 滾動容器) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-border no-scrollbar">
          {filteredCurrencies.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground font-sans">
              {t('currencySelector.noResults', '找不到相符的貨幣')}
            </div>
          ) : (
            filteredCurrencies.map((c) => {
              const isSelected = tempSelected === c.code;
              const localizedName = t(c.i18nKey);

              return (
                <div
                  key={c.code}
                  onClick={() => handleSelectRow(c.code)}
                  onDoubleClick={() => {
                    handleSelectRow(c.code);
                    onSelectCurrency(c.code);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'px-3.5 py-2.5 flex items-center justify-between transition-colors cursor-pointer select-none',
                    isSelected
                      ? 'bg-foreground text-background'
                      : 'hover:bg-muted/20 text-foreground'
                  )}
                >
                  {/* Left: Code + Localized Name (無 Emoji) */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold tracking-tight shrink-0',
                        isSelected ? 'text-background' : 'text-foreground'
                      )}
                    >
                      {c.code}
                    </span>
                    <span
                      className={cn(
                        'text-xs truncate',
                        isSelected
                          ? 'text-background/80 font-medium'
                          : 'text-muted-foreground'
                      )}
                    >
                      {localizedName}
                    </span>
                  </div>

                  {/* Right: Currency Symbol Badge */}
                  <div className="flex items-center shrink-0">
                    <span
                      className={cn(
                        'font-mono text-xs px-2 py-0.5 rounded border tracking-tight',
                        isSelected
                          ? 'bg-background/20 text-background border-background/30 font-semibold'
                          : 'bg-muted/40 text-muted-foreground border-border/60'
                      )}
                    >
                      {c.symbol}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Cancel / Confirm Actions */}
        <div data-slot="dialog-footer" className="px-4 py-3 shrink-0 border-t border-border flex flex-row items-center justify-between gap-3 bg-card">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-24 h-9 text-xs font-medium cursor-pointer"
          >
            {t('currencySelector.cancel', '取消')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="w-24 h-9 text-xs font-semibold cursor-pointer"
          >
            {t('currencySelector.confirm', '確認')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
