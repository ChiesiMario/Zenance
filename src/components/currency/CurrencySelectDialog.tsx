import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Coins } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      if (q) {
        const localizedName = t(c.i18nKey).toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const nameMatch = localizedName.includes(q);
        const symbolMatch = c.symbol.toLowerCase().includes(q);
        return codeMatch || nameMatch || symbolMatch;
      }

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
        overlayClassName={cn('z-[70]', overlayClassName)}
        className={cn(
          'z-[70] w-full max-w-[340px] sm:max-w-[340px] h-[540px] max-h-[85vh] max-h-[85dvh] p-0 sm:p-0 flex flex-col gap-0 overflow-hidden bg-card border border-border text-card-foreground shadow-none select-none rounded-lg',
          className
        )}
      >
        {/* Header: 對齊應用程式鎖與全站標準，移除下方分割線 */}
        <DialogHeader className="px-4 pt-3.5 pb-2 shrink-0 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="size-5 text-primary" />
            <span>{title || t('currencySelector.title', '選擇貨幣')}</span>
          </DialogTitle>
        </DialogHeader>

        {/* 內容主體容器：作為 DialogContent 唯一的非 Header/Footer 直接子節點，接管 flex-1，避免內部元素被父級選擇器誤拉伸 */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* 搜尋欄與分類標籤 */}
          <div className="px-4 pb-3 pt-1 border-b border-border bg-card space-y-2.5 shrink-0">
            <div className="relative flex items-center w-full">
              <Search className="size-4 text-muted-foreground absolute left-3 pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('currencySelector.searchPlaceholder', '搜尋貨幣代碼或名稱...')}
                className="w-full h-9 pl-9 pr-8 text-xs font-sans rounded-lg bg-muted/10 border-border placeholder:text-muted-foreground/60"
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

            {!searchQuery && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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

          {/* 貨幣清單滾動容器 */}
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
                      'px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer select-none',
                      isSelected
                        ? 'bg-foreground text-background'
                        : 'hover:bg-muted/20 text-foreground'
                    )}
                  >
                    {/* Left: Code + Localized Name */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
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
                    <span
                      className={cn(
                        'font-mono text-xs px-2 py-0.5 rounded border tracking-tight shrink-0',
                        isSelected
                          ? 'bg-background/20 text-background border-background/30 font-semibold'
                          : 'bg-muted/40 text-muted-foreground border-border/60'
                      )}
                    >
                      {c.symbol}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 底部按鈕：全站統一的 DialogFooter，移除上方分割線 */}
        <DialogFooter className="px-4 py-3 shrink-0 flex flex-row items-center justify-between gap-3 sm:gap-3 bg-card mt-0">
          <DialogClose render={<Button variant="outline" type="button" className="cursor-pointer" />}>
            {t('common.cancel')}
          </DialogClose>
          <Button
            type="button"
            onClick={handleConfirm}
            className="cursor-pointer"
          >
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
