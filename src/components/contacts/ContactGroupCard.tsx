import type { Account } from '@/services/db/db';
import { useTranslation } from 'react-i18next';
import { cn, getCurrencySymbol } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import React from 'react';

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
  hideGroupTag,
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
            const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';

            return (
              <div
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="flex flex-col p-3 bg-transparent border-r border-b border-border transition-colors hover:bg-muted/30 group min-h-[156px] justify-between cursor-pointer"
              >
                {/* Top: Category Tag */}
                <div className="w-full flex justify-between items-start h-3 mb-1">
                  {!hideGroupTag && (
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-normal truncate w-full text-left">
                      {contact.group === 'organization' ? t('contacts.groupOrganization') : t('contacts.groupPersonal')}
                    </span>
                  )}
                </div>
                
                {/* Middle: Avatar and Name */}
                <div className="flex flex-col items-center gap-2 text-center flex-1 justify-center my-1.5">
                  <div className="w-10 h-10 rounded-full bg-muted/50 border border-border flex items-center justify-center text-base font-medium text-foreground shrink-0">
                    {initial}
                  </div>
                  <div className="text-sm font-normal leading-none truncate w-full px-1">{contact.name}</div>
                </div>
                
                {/* Bottom: Net Total */}
                <div className="w-full text-right mt-auto pt-1">
                  <span
                    className={cn(
                      "text-xl font-mono tracking-tight font-normal truncate block",
                      netReceivable === 0
                        ? "text-muted-foreground/50"
                        : netReceivable > 0
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {netReceivable < 0 ? '-' : ''}{contact.currency ? getCurrencySymbol(contact.currency) : currencySymbol}{Math.abs(netReceivable).toLocaleString()}
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
