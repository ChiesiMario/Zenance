import type { Contact } from '@/services/db/db';
import { useTranslation } from 'react-i18next';
import { getCurrencySymbol } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';

interface ContactGroupCardProps {
  title?: string | React.ReactNode;
  contacts: Contact[];
  contactBalances: Record<string, number>;
  currencySymbol: string;
  hideGroupTag?: boolean;
  emptyMessage?: string;
}

export function ContactGroupCard({
  title,
  contacts,
  contactBalances,
  currencySymbol,
  emptyMessage,
}: ContactGroupCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground mb-6 shadow-none">
      {title && (
        <div className="p-3 border-b border-border bg-muted/20 text-left flex items-center">
          {typeof title === 'string' ? <h3 className="text-sm font-medium px-1">{title}</h3> : title}
        </div>
      )}
      
      {(!contacts || contacts.length === 0) ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyMessage || t('contacts.noContacts')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 -mr-px -mb-px">
          {contacts.map(contact => {
            const netReceivable = contactBalances[contact.id] || 0;
            const sym = contact.currency ? getCurrencySymbol(contact.currency) : currencySymbol;
            const absAmt = Math.abs(netReceivable).toLocaleString(undefined, { maximumFractionDigits: 2 });

            return (
              <div
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="flex flex-col items-center justify-center py-3 bg-transparent border-r border-b border-border transition-colors hover:bg-muted/30 group min-h-[128px] cursor-pointer"
              >
                {/* 1. Avatar */}
                <ContactAvatar 
                  group={contact.group} 
                  className="w-10 h-10 shrink-0" 
                  iconClassName="w-5 h-5 text-muted-foreground" 
                  title={contact.name} 
                />

                {/* [留白 1] 2. Name */}
                <div className="w-full text-center px-3 mt-2">
                  <div className="text-xs font-medium leading-none truncate w-full px-1">{contact.name}</div>
                </div>
                
                {/* [留白 2] 3. Divider (Spanning full width with 20px margin on both sides) */}
                <div className="w-full px-5 mt-2 shrink-0">
                  <div className="w-full border-t border-border/60" />
                </div>

                {/* [留白 3] 4. Bottom: Status & Amount (Fixed slot, strictly aligned across all cards) */}
                <div className="h-[28px] flex flex-col items-center justify-center text-center w-full px-3 mt-2">
                  {netReceivable === 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground/60 border border-border/60 leading-none">
                      {t('contacts.settled')}
                    </span>
                  ) : netReceivable > 0 ? (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/80 block leading-none mb-1">
                        {t('contacts.toCollect')}
                      </span>
                      <span className="text-xs font-mono font-medium tracking-tight text-emerald-500 block truncate leading-none">
                        {sym}{absAmt}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/80 block leading-none mb-1">
                        {t('contacts.toPay')}
                      </span>
                      <span className="text-xs font-mono font-medium tracking-tight text-rose-500 block truncate leading-none">
                        {sym}{absAmt}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
