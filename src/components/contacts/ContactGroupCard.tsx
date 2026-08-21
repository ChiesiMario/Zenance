import type { Account } from '@/services/db/db';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

import React from 'react';

interface ContactGroupCardProps {
  title?: string | React.ReactNode;
  contacts: Account[];
  contactBalances: Record<string, number>;
  currencySymbol: string;
  hideGroupTag?: boolean;
}

export function ContactGroupCard({ title, contacts, contactBalances, currencySymbol, hideGroupTag }: ContactGroupCardProps) {
  const { t } = useTranslation();

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground mb-6">
      {title && (
        <div className="p-3 border-b border-border bg-muted/20 text-left flex items-center">
          {typeof title === 'string' ? <h3 className="text-sm font-medium px-1">{title}</h3> : title}
        </div>
      )}
      
      {(!contacts || contacts.length === 0) ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t('contacts.noContacts')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 -mr-px -mb-px">
        {contacts.map(contact => {
          const balance = contactBalances[contact.id] || 0;
          const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';
          return (
            <div key={contact.id} className="flex flex-col p-3 bg-transparent border-r border-b border-border transition-colors hover:bg-muted/30 group h-[140px] justify-between cursor-pointer">
              
              <div className="w-full flex justify-between items-start h-3 mb-1">
                {!hideGroupTag && (
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-normal truncate w-full text-left">
                    {contact.group === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                  </span>
                )}
              </div>
              
              <div className="flex flex-col items-center gap-1.5 text-center flex-1 justify-center mt-4">
                <div className="w-10 h-10 rounded-full bg-muted/50 border border-border flex items-center justify-center text-base font-medium text-foreground shrink-0">
                  {initial}
                </div>
                <div className="text-sm font-normal leading-none truncate w-full px-1">{contact.name}</div>
              </div>
              
              <div className="w-full text-right">
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
      )}
    </div>
  );
}
