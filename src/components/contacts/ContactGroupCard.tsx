import type { Account } from '@/services/db/db';
import { useTranslation } from 'react-i18next';
import { getCurrencySymbol } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';

interface ContactGroupCardProps {
  title?: string | React.ReactNode;
  contacts: Account[];
  contactBalances: Record<string, number>;
  contactReimbursements?: Record<string, number>;
  currencySymbol: string;
  hideGroupTag?: boolean;
  emptyMessage?: string;
}

export function ContactGroupCard({
  title,
  contacts,
  contactBalances,
  contactReimbursements = {},
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
            const loanBalance = contactBalances[contact.id] || 0;
            const reimbBalance = contactReimbursements[contact.id] || 0;
            const netReceivable = loanBalance + reimbBalance;
            const sym = contact.currency ? getCurrencySymbol(contact.currency) : currencySymbol;
            const absAmt = Math.abs(netReceivable).toLocaleString(undefined, { maximumFractionDigits: 2 });

            return (
              <div
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="flex flex-col items-center justify-center p-3 bg-transparent border-r border-b border-border transition-colors hover:bg-muted/30 group min-h-[128px] cursor-pointer"
              >
                {/* Top: Avatar and Name */}
                <div className="flex flex-col items-center gap-1.5 text-center w-full">
                  <ContactAvatar 
                    group={contact.group} 
                    className="w-10 h-10" 
                    iconClassName="w-5 h-5 text-muted-foreground" 
                    title={contact.name} 
                  />
                  <div className="text-sm font-medium leading-none truncate w-full px-1">{contact.name}</div>
                </div>
                
                {/* Bottom: Status & Amount (Fixed 30px slot, strictly aligned across all cards) */}
                <div className="h-[30px] flex flex-col items-center justify-center text-center w-full mt-1.5">
                  {netReceivable === 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground/60 border border-border/60 leading-none">
                      {t('contacts.settled')}
                    </span>
                  ) : netReceivable > 0 ? (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/80 block leading-none mb-1">
                        {t('contacts.toCollect')}
                      </span>
                      <span className="text-sm font-mono font-medium tracking-tight text-emerald-500 block truncate leading-none">
                        {sym}{absAmt}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/80 block leading-none mb-1">
                        {t('contacts.toPay')}
                      </span>
                      <span className="text-sm font-mono font-medium tracking-tight text-rose-500 block truncate leading-none">
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
