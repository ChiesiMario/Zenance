import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLedgers } from '@/hooks/useLedgers';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Wallet } from 'lucide-react';

export default function Setup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { addLedger } = useLedgers();
  const { setActiveLedgerId } = useAppStore();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  
  // Default currency logic
  const getDefaultCurrency = () => {
    if (i18n.language === 'zh-TW') return 'TWD';
    if (i18n.language === 'zh-CN') return 'CNY';
    return 'USD';
  };
  const [currency, setCurrency] = useState(getDefaultCurrency());

  const handleNext = () => {
    if (name.trim()) {
      setStep(2);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) return;
    
    try {
      const newLedger = await addLedger(name.trim(), currency);
      setActiveLedgerId(newLedger.id);
      // If they click 'Connect', we would initiate Dropbox OAuth here.
      // For now, we just complete the setup and go to dashboard.
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Failed to create ledger:', error);
    }
  };

  if (step === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 selection:bg-primary selection:text-primary-foreground">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <div className="rounded-full border border-border p-5 bg-muted/5">
              <Wallet className="size-12 text-primary" strokeWidth={1} />
            </div>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
            Zenance
          </h1>
          
          <p className="text-muted-foreground mb-16 max-w-[280px] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
            {t('setup.welcomeTagline')}
          </p>

          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">
            <Button
              onClick={() => setStep(1)}
              className="w-full h-12 text-md font-medium"
            >
              {t('setup.getStarted')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 selection:bg-primary selection:text-primary-foreground">
        <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-12">
            {t('setup.title')}
          </p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('setup.namePlaceholder')}
            className="w-full bg-transparent text-center text-6xl font-bold tracking-tight outline-none placeholder:text-muted focus:ring-0"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
          />

          <div className="mt-16 w-full flex flex-col items-center gap-6">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="text-sm font-mono uppercase tracking-widest">{t('setup.currency')}</span>
              <Select value={currency} onValueChange={(v) => setCurrency(v as string)}>
                <SelectTrigger className="w-[100px] border-none shadow-none focus:ring-0 bg-transparent text-center font-mono text-lg text-foreground p-0 h-auto [&>svg]:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TWD">TWD</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleNext}
              disabled={!name.trim()}
              className="w-full max-w-[200px] h-12 text-md font-medium mt-4"
            >
              {t('setup.next')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 selection:bg-primary selection:text-primary-foreground">
      <div className="w-full max-w-sm flex flex-col items-center text-center animate-in slide-in-from-right-8 fade-in duration-500">
        <div className="mb-8 rounded-full border border-border p-4 bg-muted/10">
          <Cloud className="size-10 text-primary" strokeWidth={1.5} />
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          {t('setup.syncTitle')}
        </h1>
        <p className="text-muted-foreground mb-12 max-w-[280px]">
          {t('setup.syncDesc')}
        </p>

        <div className="w-full flex flex-col gap-3">
          <Button
            onClick={handleComplete}
            className="w-full h-12 text-md font-medium"
          >
            {t('setup.connect')}
          </Button>
          <Button
            onClick={handleComplete}
            variant="ghost"
            className="w-full h-12 text-md font-medium text-muted-foreground"
          >
            {t('setup.skip')}
          </Button>
        </div>
      </div>
    </div>
  );
}
