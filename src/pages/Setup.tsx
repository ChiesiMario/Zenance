import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { useDropboxSync } from '@/hooks/useDropboxSync';
import { db } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import { CurrencySelectDialog } from '@/components/currency/CurrencySelectDialog';
import { getCurrencyInfo } from '@/lib/currencies';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  WifiOff,
  Smartphone,
  Lock,
  Cloud,
  CheckCircle2,
  FileArchive,
  ChevronDown,
} from 'lucide-react';

export default function Setup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addLedger } = useLedgers();
  const { setActiveLedgerId } = useAppStore();
  const { connectDropbox } = useDropboxSync();

  // Screen state: 1 | 2 | 3
  const [screen, setScreen] = useState<1 | 2 | 3>(1);

  // Screen 3 choices: 'create' | 'restore'
  const [choice, setChoice] = useState<'create' | 'restore'>('create');

  // New ledger form state
  const [ledgerName, setLedgerName] = useState(() => t('setup.defaultLedgerName'));
  
  const getDefaultCurrency = () => {
    const lang = i18n.resolvedLanguage || i18n.language || 'zh-TW';
    if (lang === 'zh-TW' || lang.startsWith('zh-TW')) return 'TWD';
    if (lang === 'zh-CN' || lang.startsWith('zh-CN')) return 'CNY';
    return 'USD';
  };
  const [currency, setCurrency] = useState(getDefaultCurrency);
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);

  // Restore Modal & File Input
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 創建新帳本並完成嚮導
  const handleCreateLedger = async () => {
    const finalName = ledgerName.trim() || t('setup.defaultLedgerName');
    try {
      const newLedger = await addLedger(finalName, currency);
      setActiveLedgerId(newLedger.id);

      // 自動初始化一個基礎「現金」錢包帳戶，讓用戶進入後即可記帳
      const accountCount = await db.accounts
        .where('ledgerId')
        .equals(newLedger.id)
        .filter((a) => !a.deleted)
        .count();

      if (accountCount === 0) {
        await db.accounts.add({
          id: uuidv4(),
          ledgerId: newLedger.id,
          name: t('setup.defaultCashWallet'),
          type: 'wallet',
          group: 'cash',
          isDefault: true,
          initialBalance: 0,
          currency,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deleted: false,
        });
      }

      navigate('/', { replace: true });
    } catch (error) {
      console.error('Failed to create ledger:', error);
      toast.show(t('common.error', '發生錯誤，請重試'));
    }
  };

  // 處理本機備份檔匯入還原 (.zip / .json)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    try {
      const isZip = file.name.endsWith('.zip') || file.type.includes('zip');
      if (isZip) {
        const JSZipModule = (await import('jszip')).default;
        const zip = await JSZipModule.loadAsync(file);
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
          toast.show(t('setup.restoreFailed'));
          return;
        }

        const manifest = JSON.parse(await manifestFile.async('text'));
        const ledgers = manifest.ledgers || [];

        if (ledgers.length === 0) {
          toast.show(t('setup.restoreFailed'));
          return;
        }

        for (const lItem of ledgers) {
          const lFolder = zip.folder(`ledgers/${lItem.id}`);
          if (!lFolder) continue;

          const ledgerFile = lFolder.file('ledger.json');
          if (!ledgerFile) continue;

          const ledgerData = JSON.parse(await ledgerFile.async('text'));
          await db.ledgers.put(ledgerData);

          const accountsFile = lFolder.file('accounts.json');
          if (accountsFile) {
            const accounts = JSON.parse(await accountsFile.async('text'));
            if (accounts.length) await db.accounts.bulkPut(accounts);
          }

          const contactsFile = lFolder.file('contacts.json');
          if (contactsFile) {
            const contacts = JSON.parse(await contactsFile.async('text'));
            if (contacts.length) await db.contacts.bulkPut(contacts);
          }

          const categoriesFile = lFolder.file('categories.json');
          if (categoriesFile) {
            const categories = JSON.parse(await categoriesFile.async('text'));
            if (categories.length) await db.categories.bulkPut(categories);
          }

          const txFolder = lFolder.folder('transactions');
          if (txFolder) {
            const txFiles: string[] = [];
            txFolder.forEach((relPath, f) => {
              if (relPath.endsWith('.json') && !relPath.endsWith('manifest.json') && !f.dir) {
                txFiles.push(relPath);
              }
            });
            for (const tfName of txFiles) {
              const tf = txFolder.file(tfName);
              if (tf) {
                const chunk = JSON.parse(await tf.async('text'));
                if (Array.isArray(chunk) && chunk.length) {
                  await db.transactions.bulkPut(chunk);
                }
              }
            }
          }
        }

        const defaultLedger = (await db.ledgers.filter((l) => !l.deleted).toArray())[0];
        if (defaultLedger) {
          setActiveLedgerId(defaultLedger.id);
        }

        toast.show(t('setup.restoreSuccess'));
        setIsRestoreModalOpen(false);
        navigate('/', { replace: true });
      } else {
        const text = await file.text();
        const raw = JSON.parse(text);
        if (!raw || !raw.data || !raw.data.ledgers?.length) {
          toast.show(t('setup.restoreFailed'));
          return;
        }

        const { ledgers = [], accounts = [], contacts = [], categories = [], transactions = [] } = raw.data;
        if (ledgers.length) await db.ledgers.bulkPut(ledgers);
        if (accounts.length) await db.accounts.bulkPut(accounts);
        if (contacts.length) await db.contacts.bulkPut(contacts);
        if (categories.length) await db.categories.bulkPut(categories);
        if (transactions.length) await db.transactions.bulkPut(transactions);

        setActiveLedgerId(ledgers[0].id);
        toast.show(t('setup.restoreSuccess'));
        setIsRestoreModalOpen(false);
        navigate('/', { replace: true });
      }
    } catch (err) {
      console.error('Failed to restore file:', err);
      toast.show(t('setup.restoreFailed'));
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col items-center justify-center bg-background px-5 selection:bg-primary selection:text-primary-foreground overflow-hidden">
      {/* 隱藏的備份檔案選擇器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 核心卡片容器：寬度 420px、全高固定、底部按鈕靠底 */}
      <div className="w-full max-w-[420px] h-full flex flex-col justify-between py-6">
        
        {/* ================= 第 1 屏：PWA 架構與本地優先 ================= */}
        {screen === 1 && (
          <div className="w-full flex-1 flex flex-col justify-between">
            <div className="flex-1 flex flex-col items-center justify-center my-auto">
              {/* Zenance 官方 Logo (居中對齊) */}
              <div className="h-14 mb-4 flex items-center justify-center">
                <Logo size={56} variant="app-icon" showBorder />
              </div>

              {/* 大標題與說明 (居中對齊，固定高度防抖) */}
              <div className="min-h-[84px] flex flex-col items-center text-center gap-2 mb-5">
                <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground leading-[1.2] whitespace-pre-line text-center">
                  {t('setup.s1Title')}
                </h1>
                <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed max-w-[320px] mx-auto text-center">
                  {t('setup.s1Desc')}
                </p>
              </div>

              {/* 特性卡片清單 (純向量圖標 + 說明，寬度自適應內容 w-fit) */}
              <div className="w-fit max-w-full mx-auto border border-border rounded-lg bg-card divide-y divide-border">
                <div className="min-h-[68px] px-4 py-3 flex items-center gap-3.5">
                  <div className="size-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                    <WifiOff className="size-[18px]" strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">
                      {t('setup.s1F1Head')}
                    </span>
                    <span className="text-xs text-muted-foreground leading-normal">
                      {t('setup.s1F1Body')}
                    </span>
                  </div>
                </div>

                <div className="min-h-[68px] px-4 py-3 flex items-center gap-3.5">
                  <div className="size-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                    <Smartphone className="size-[18px]" strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">
                      {t('setup.s1F2Head')}
                    </span>
                    <span className="text-xs text-muted-foreground leading-normal">
                      {t('setup.s1F2Body')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按鈕列 (固定在底部) */}
            <div className="w-full shrink-0 pt-4">
              <Button
                type="button"
                className="w-full h-10 text-xs sm:text-sm font-medium cursor-pointer"
                onClick={() => setScreen(2)}
              >
                {t('setup.continue')}
              </Button>
            </div>
          </div>
        )}

        {/* ================= 第 2 屏：端到端加密與雲端同步 ================= */}
        {screen === 2 && (
          <div className="w-full flex-1 flex flex-col justify-between">
            <div className="flex-1 flex flex-col items-center justify-center my-auto">
              {/* 圖標插槽 (56px 統一高度，居中對齊) */}
              <div className="h-14 mb-4 flex items-center justify-center">
                <div className="size-14 rounded-[14px] border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                  <Lock className="size-6 text-foreground" strokeWidth={1.8} />
                </div>
              </div>

              {/* 大標題與說明 (居中對齊，固定高度防抖) */}
              <div className="min-h-[84px] flex flex-col items-center text-center gap-2 mb-5">
                <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground leading-[1.2] whitespace-pre-line text-center">
                  {t('setup.s2Title')}
                </h1>
                <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed max-w-[320px] mx-auto text-center">
                  {t('setup.s2Desc')}
                </p>
              </div>

              {/* 特性卡片清單 (純向量圖標 + 說明，寬度自適應內容 w-fit) */}
              <div className="w-fit max-w-full mx-auto border border-border rounded-lg bg-card divide-y divide-border">
                <div className="min-h-[68px] px-4 py-3 flex items-center gap-3.5">
                  <div className="size-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                    <Lock className="size-[18px]" strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">
                      {t('setup.s2F1Head')}
                    </span>
                    <span className="text-xs text-muted-foreground leading-normal">
                      {t('setup.s2F1Body')}
                    </span>
                  </div>
                </div>

                <div className="min-h-[68px] px-4 py-3 flex items-center gap-3.5">
                  <div className="size-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                    <Cloud className="size-[18px]" strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">
                      {t('setup.s2F2Head')}
                    </span>
                    <span className="text-xs text-muted-foreground leading-normal">
                      {t('setup.s2F2Body')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按鈕列 (固定在底部，取消在左，前進在右) */}
            <div className="w-full shrink-0 pt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 min-w-[84px] text-xs sm:text-sm font-medium cursor-pointer"
                onClick={() => setScreen(1)}
              >
                {t('setup.back')}
              </Button>
              <Button
                type="button"
                className="flex-1 h-10 text-xs sm:text-sm font-medium cursor-pointer"
                onClick={() => setScreen(3)}
              >
                {t('setup.continue')}
              </Button>
            </div>
          </div>
        )}

        {/* ================= 第 3 屏：直擊決策 (創建新帳本 vs 從備份中恢復) ================= */}
        {screen === 3 && (
          <div className="w-full flex-1 flex flex-col justify-between">
            <div className="flex-1 flex flex-col items-center justify-center my-auto">
              {/* 圖標插槽 (56px 統一高度，居中對齊) */}
              <div className="h-14 mb-4 flex items-center justify-center">
                <div className="size-14 rounded-[14px] border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                  <CheckCircle2 className="size-6 text-foreground" strokeWidth={1.8} />
                </div>
              </div>

              {/* 大標題與說明 (居中對齊，固定高度防抖) */}
              <div className="min-h-[84px] flex flex-col items-center text-center gap-2 mb-5">
                <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground leading-[1.2] whitespace-pre-line text-center">
                  {t('setup.s3Title')}
                </h1>
                <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed max-w-[320px] mx-auto text-center">
                  {t('setup.s3Desc')}
                </p>
              </div>

              {/* 兩大核心決策卡片 */}
              <div className="w-full flex flex-col gap-3">
                {/* 選項 A：創建新帳本 */}
                <div
                  onClick={() => setChoice('create')}
                  className={`border rounded-lg p-3.5 sm:p-4 bg-card cursor-pointer transition-colors ${
                    choice === 'create'
                      ? 'border-foreground'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${
                          choice === 'create' ? 'border-foreground' : 'border-border'
                        }`}
                      >
                        {choice === 'create' && (
                          <div className="size-2 rounded-full bg-foreground" />
                        )}
                      </div>
                      <span className="text-[13px] sm:text-sm font-semibold text-foreground tracking-tight">
                        {t('setup.choiceCreateTitle')}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-muted/30">
                      {t('setup.choiceCreateBadge')}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-normal mt-1.5 pl-6.5">
                    {t('setup.choiceCreateDesc')}
                  </p>

                  {/* 內嵌配置輸入項 (標準欄位標籤與 40px 輸入元件) */}
                  {choice === 'create' && (
                    <div className="mt-3.5 pt-3 border-t border-border/80 border-dashed flex flex-col gap-3 pl-6.5">
                      {/* 帳本名稱欄位 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {t('setup.ledgerNameLabel')}
                        </label>
                        <input
                          type="text"
                          value={ledgerName}
                          onChange={(e) => setLedgerName(e.target.value)}
                          placeholder={t('setup.ledgerNamePlaceholder')}
                          className="h-10 w-full rounded-md border border-input bg-muted/20 px-3 text-xs sm:text-sm text-foreground outline-none focus:border-foreground transition-colors font-sans"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* 預設貨幣欄位 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {t('setup.currencyLabel')}
                        </label>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCurrencyDialogOpen(true);
                          }}
                          className="h-10 w-full rounded-md border border-input bg-muted/20 px-3 flex items-center justify-between cursor-pointer hover:border-foreground transition-colors text-xs sm:text-sm text-foreground"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-foreground">{currency}</span>
                            <span className="text-muted-foreground text-xs sm:text-sm font-sans">
                              ({t(getCurrencyInfo(currency)?.i18nKey || '') || currency})
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <span>{t('setup.change')}</span>
                            <ChevronDown className="size-3.5" />
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 選項 B：從備份中恢復 */}
                <div
                  onClick={() => setChoice('restore')}
                  className={`border rounded-lg p-3.5 sm:p-4 bg-card cursor-pointer transition-colors ${
                    choice === 'restore'
                      ? 'border-foreground'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${
                          choice === 'restore' ? 'border-foreground' : 'border-border'
                        }`}
                      >
                        {choice === 'restore' && (
                          <div className="size-2 rounded-full bg-foreground" />
                        )}
                      </div>
                      <span className="text-[13px] sm:text-sm font-semibold text-foreground tracking-tight">
                        {t('setup.choiceRestoreTitle')}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-muted/30">
                      {t('setup.choiceRestoreBadge')}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-normal mt-1.5 pl-6.5">
                    {t('setup.choiceRestoreDesc')}
                  </p>
                </div>
              </div>
            </div>

            {/* 底部按鈕列 (固定在底部，取消在左，前進在右) */}
            <div className="w-full shrink-0 pt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 min-w-[84px] text-xs sm:text-sm font-medium cursor-pointer"
                onClick={() => setScreen(2)}
              >
                {t('setup.back')}
              </Button>
              <Button
                type="button"
                className="flex-1 h-10 text-xs sm:text-sm font-medium cursor-pointer"
                onClick={() => {
                  if (choice === 'create') {
                    handleCreateLedger();
                  } else {
                    setIsRestoreModalOpen(true);
                  }
                }}
              >
                {choice === 'create' ? t('setup.enterApp') : t('setup.chooseBackup')}
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* 貨幣選擇器彈窗 (平級兄弟節點聲明) */}
      <CurrencySelectDialog
        open={isCurrencyDialogOpen}
        onOpenChange={setIsCurrencyDialogOpen}
        selectedCurrency={currency}
        onSelectCurrency={setCurrency}
      />

      {/* 還原來源選擇彈窗 (平級兄弟節點聲明，Flat Design，無陰影) */}
      <Dialog open={isRestoreModalOpen} onOpenChange={setIsRestoreModalOpen}>
        <DialogContent className="sm:max-w-[360px] max-w-[360px] p-5 gap-4 shadow-none">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <FileArchive className="size-5 text-foreground shrink-0" />
              <span>{t('setup.restoreModalTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed text-left">
              {t('setup.restoreModalDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 pt-1">
            {/* Dropbox 雲端同步恢復 */}
            <button
              type="button"
              disabled={isRestoring}
              onClick={() => {
                setIsRestoreModalOpen(false);
                connectDropbox();
              }}
              className="h-[52px] border border-border rounded-lg px-3.5 flex items-center gap-3 bg-card hover:bg-muted/40 transition-colors text-left cursor-pointer group"
            >
              <div className="size-8 rounded-md border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                <Cloud className="size-4" strokeWidth={1.8} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-foreground group-hover:underline">
                  {t('setup.restoreDropboxTitle')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('setup.restoreDropboxDesc')}
                </span>
              </div>
            </button>

            {/* 本地檔案匯入還原 */}
            <button
              type="button"
              disabled={isRestoring}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="h-[52px] border border-border rounded-lg px-3.5 flex items-center gap-3 bg-card hover:bg-muted/40 transition-colors text-left cursor-pointer group"
            >
              <div className="size-8 rounded-md border border-border bg-muted/30 flex items-center justify-center shrink-0 text-foreground">
                <FileArchive className="size-4" strokeWidth={1.8} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-foreground group-hover:underline">
                  {t('setup.restoreFileTitle')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('setup.restoreFileDesc')}
                </span>
              </div>
            </button>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isRestoring}
              onClick={() => setIsRestoreModalOpen(false)}
              className="w-full h-9 text-xs cursor-pointer"
            >
              {t('setup.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
