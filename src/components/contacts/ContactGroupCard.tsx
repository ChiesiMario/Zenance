import type { Account } from '@/services/db/db';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ContactGroupCardProps {
  title: string;
  contacts: Account[];
  contactBalances: Record<string, number>;
  currencySymbol: string;
}

export function ContactGroupCard({ title, contacts, contactBalances, currencySymbol }: ContactGroupCardProps) {
  const { t } = useTranslation();

  if (!contacts || contacts.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground mb-6">
      <div className="p-4 border-b border-border bg-muted/20 text-left">
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 -mr-px -mb-px">
        {contacts.map(contact => {
          const balance = contactBalances[contact.id] || 0;
          const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';
          return (
            <div key={contact.id} className="flex flex-col p-4 bg-transparent border-r border-b border-border transition-colors hover:bg-muted/30 group h-[140px] justify-between cursor-pointer">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-full bg-muted/50 border border-border flex items-center justify-center text-lg font-medium text-foreground shrink-0">
                  {initial}
                </div>
                <div className="text-sm font-medium leading-none truncate w-full">{contact.name}</div>
              </div>
              
              <div className="w-full text-left">
                <span className="text-[10px] uppercase tracking-widest leading-none mb-1 block text-muted-foreground min-h-[10px]">
                  {balance === 0 ? "" : balance > 0 ? t('contacts.owesYou') : t('contacts.youOwe')}
                </span>
                <span className={cn("text-xl font-mono tracking-tight font-medium truncate block", balance === 0 ? "text-muted-foreground" : balance > 0 ? "text-primary" : "text-destructive")}>
                  {currencySymbol}{Math.abs(balance).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
