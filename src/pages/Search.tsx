import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  Search as SearchIcon,
  X,
  Clock,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { GroupedTransactionList } from '@/components/transactions/GroupedTransactionList';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { useBudgets } from '@/hooks/useBudgets';
import { useContacts } from '@/hooks/useContacts';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { cn, sortTransactionsDesc } from '@/lib/utils';

const RECENT_SEARCHES_KEY = 'zenance_recent_searches';
const MAX_RECENT_SEARCHES = 8;

type SearchTab = 'all' | 'transactions' | 'accounts' | 'budgets' | 'contacts';
type TxTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export default function Search() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { activeLedgerId } = useAppStore();
  const { ledgers } = useLedgers();
  const activeLedger = ledgers?.find((l) => l.id === activeLedgerId);
  const baseCurrency = activeLedger?.baseCurrency || 'CNY';

  const { transactions } = useTransactions();
  const { wallets } = useAccounts();
  const { budgets } = useBudgets();
  const { contacts } = useContacts();
  const { allCategories } = useCategories();
  const { allTags } = useTags();

  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // 自動聚焦於搜尋輸入框（全域搜尋頁之特許例外，確保點擊搜尋後立即能夠鍵入）
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 讀取本地近期搜尋紀錄（自動去重）
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const unique = Array.from(
            new Set(parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))
          );
          setRecentSearches(unique.slice(0, MAX_RECENT_SEARCHES));
        }
      }
    } catch {
      // 容錯靜默處理
    }
  }, []);

  // 儲存搜尋詞到歷史紀錄
  const saveSearchQuery = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // 容錯靜默處理
      }
      return next;
    });
  }, []);

  const handleClearHistory = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // 容錯靜默處理
    }
  };

  const handleRemoveHistoryItem = (itemToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item !== itemToRemove);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // 容錯靜默處理
      }
      return next;
    });
  };

  // 映射索引快取以供極速比對
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    allCategories?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [allCategories]);

  const tagMap = useMemo(() => {
    const map = new Map<string, string>();
    allTags?.forEach((tag) => map.set(tag.id, tag.name));
    return map;
  }, [allTags]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    wallets?.forEach((w) => map.set(w.id, w.name));
    return map;
  }, [wallets]);

  // 乾淨關鍵字
  const cleanQuery = searchQuery.trim().toLowerCase();

  // 1. 交易檢索
  const matchedTransactions = useMemo(() => {
    if (!cleanQuery || !transactions) return [];

    const isNumericQuery = !isNaN(Number(cleanQuery));

    return sortTransactionsDesc(
      transactions.filter((tx) => {
        if (tx.deleted) return false;
        if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;

        // 備註比對
        if (tx.note && tx.note.toLowerCase().includes(cleanQuery)) return true;

        // 分類名比對
        const catName = categoryMap.get(tx.category);
        if (catName && catName.toLowerCase().includes(cleanQuery)) return true;

        // 標籤名比對
        if (tx.tagIds?.some((tid) => tagMap.get(tid)?.toLowerCase().includes(cleanQuery))) {
          return true;
        }

        // 帳戶名比對
        const accName = accountMap.get(tx.accountId);
        if (accName && accName.toLowerCase().includes(cleanQuery)) return true;
        if (tx.toAccountId) {
          const toAccName = accountMap.get(tx.toAccountId);
          if (toAccName && toAccName.toLowerCase().includes(cleanQuery)) return true;
        }

        // 金額數值精確或前綴比對
        if (isNumericQuery) {
          if (String(tx.amount).includes(cleanQuery)) return true;
          if (tx.originalAmount && String(tx.originalAmount).includes(cleanQuery)) return true;
        }

        return false;
      })
    );
  }, [cleanQuery, transactions, txTypeFilter, categoryMap, tagMap, accountMap]);

  // 2. 帳戶檢索
  const matchedAccounts = useMemo(() => {
    if (!cleanQuery || !wallets) return [];
    return wallets.filter((w) => {
      if (w.deleted) return false;
      if (w.name.toLowerCase().includes(cleanQuery)) return true;
      if (w.currency && w.currency.toLowerCase().includes(cleanQuery)) return true;
      return false;
    });
  }, [cleanQuery, wallets]);

  // 3. 預算檢索
  const matchedBudgets = useMemo(() => {
    if (!cleanQuery || !budgets) return [];
    return budgets.filter((b) => {
      if (b.deleted) return false;
      if (b.name.toLowerCase().includes(cleanQuery)) return true;
      return false;
    });
  }, [cleanQuery, budgets]);

  // 4. 對象檢索
  const matchedContacts = useMemo(() => {
    if (!cleanQuery || !contacts) return [];
    return contacts.filter((c) => {
      if (c.deleted) return false;
      if (c.name.toLowerCase().includes(cleanQuery)) return true;
      return false;
    });
  }, [cleanQuery, contacts]);

  const totalResultsCount =
    matchedTransactions.length +
    matchedAccounts.length +
    matchedBudgets.length +
    matchedContacts.length;

  // 當前選取的 Tab 在搜尋詞改變導致結果數歸零時，若總結果 > 0，則自動回退至 'all'
  useEffect(() => {
    if (!cleanQuery) {
      if (activeTab !== 'all') {
        setActiveTab('all');
      }
      return;
    }

    if (activeTab === 'transactions' && matchedTransactions.length === 0 && totalResultsCount > 0) {
      setActiveTab('all');
    } else if (activeTab === 'accounts' && matchedAccounts.length === 0 && totalResultsCount > 0) {
      setActiveTab('all');
    } else if (activeTab === 'budgets' && matchedBudgets.length === 0 && totalResultsCount > 0) {
      setActiveTab('all');
    } else if (activeTab === 'contacts' && matchedContacts.length === 0 && totalResultsCount > 0) {
      setActiveTab('all');
    }
  }, [
    cleanQuery,
    activeTab,
    matchedTransactions.length,
    matchedAccounts.length,
    matchedBudgets.length,
    matchedContacts.length,
    totalResultsCount,
  ]);

  return (
    <div className="w-full space-y-4 pb-20">
      {/* 頂部搜尋欄 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 -ml-2 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="relative flex-1 flex items-center">
          <SearchIcon className="size-4 text-muted-foreground absolute left-3 pointer-events-none" />
          <Input
            ref={inputRef}
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveSearchQuery(searchQuery);
              }
            }}
            placeholder={t('search.placeholder', '搜尋交易、帳戶、預算、對象...')}
            className="w-full h-10 pl-9 pr-8 text-xs font-sans rounded-lg bg-muted/10 border-border placeholder:text-muted-foreground/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 實體類別切換標籤：僅在有輸入搜尋詞時顯示 */}
      {cleanQuery && (
        <SegmentedControl<SearchTab>
          value={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
            saveSearchQuery(cleanQuery);
          }}
          fullWidth
          options={[
            {
              value: 'all',
              label: t('search.tabs.all', '全部'),
              disabled: totalResultsCount === 0,
            },
            {
              value: 'transactions',
              label: t('search.tabs.transactions', '交易'),
              disabled: matchedTransactions.length === 0,
            },
            {
              value: 'accounts',
              label: t('search.tabs.accounts', '帳戶'),
              disabled: matchedAccounts.length === 0,
            },
            {
              value: 'budgets',
              label: t('search.tabs.budgets', '預算'),
              disabled: matchedBudgets.length === 0,
            },
            {
              value: 'contacts',
              label: t('search.tabs.contacts', '對象'),
              disabled: matchedContacts.length === 0,
            },
          ]}
        />
      )}

      {/* 交易專屬次級類型過濾器 */}
      {activeTab === 'transactions' && cleanQuery && matchedTransactions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(['all', 'expense', 'income', 'transfer'] as TxTypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTxTypeFilter(type)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors cursor-pointer border',
                txTypeFilter === type
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/20 text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {t(`search.types.${type}`)}
            </button>
          ))}
        </div>
      )}

      {/* 狀態一：未輸入任何搜尋詞時（僅展示近期搜尋紀錄，無紀錄則留白） */}
      {!cleanQuery ? (
        recentSearches.length > 0 ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {t('search.recentSearches', '近期搜尋')}
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="size-3" />
                {t('search.clearHistory', '清空')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((item) => (
                <div
                  key={item}
                  onClick={() => {
                    setSearchQuery(item);
                    saveSearchQuery(item);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted/40 hover:bg-muted/80 text-foreground border border-border cursor-pointer transition-colors group"
                >
                  <span>{item}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveHistoryItem(item, e)}
                    className="text-muted-foreground hover:text-foreground -mr-1 p-0.5"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null
      ) : totalResultsCount === 0 ? (
        // 狀態二：有輸入但找不到相符結果
        <div className="p-12 text-center space-y-2">
          <SearchIcon className="size-8 text-muted-foreground/50 mx-auto" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">
            {t('search.noResults', { query: searchQuery })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('search.noResultsHint', '請嘗試縮短關鍵字，或切換至不同分類標籤')}
          </p>
        </div>
      ) : (
        // 狀態三：搜尋結果列表展示
        <div className="space-y-4">
          {/* === A. 全部視圖 (All Tab) === */}
          {activeTab === 'all' && (
            <>
              {/* 交易結果組（全部視圖下無需按日期分組） */}
              {matchedTransactions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    <span>{t('search.sections.transactions', '交易紀錄')}</span>
                    {matchedTransactions.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('transactions')}
                        className="hover:text-foreground cursor-pointer transition-colors"
                      >
                        {t('search.viewAll', { count: matchedTransactions.length })}
                      </button>
                    )}
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                    {matchedTransactions.slice(0, 3).map((tx) => {
                      const isExpense = tx.type === 'expense';
                      const isIncome = tx.type === 'income';
                      const isTransfer = tx.type === 'transfer';
                      const isLoan = tx.type === 'loan';

                      let titleNode: React.ReactNode = tx.note || categoryMap.get(tx.category) || t('common.uncategorized');
                      if (isTransfer) {
                        const fromName = accountMap.get(tx.accountId) || '';
                        const toName = accountMap.get(tx.toAccountId || '') || '';
                        titleNode = (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0">
                              {fromName}
                            </span>
                            <span className="text-muted-foreground/60 text-xs shrink-0 select-none">→</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0">
                              {toName}
                            </span>
                          </div>
                        );
                      } else if (isLoan) {
                        const isLent = contacts?.some((c) => c.id === tx.toAccountId);
                        const contactId = isLent ? tx.toAccountId : tx.accountId;
                        const contactName = contacts?.find((c) => c.id === contactId)?.name || t('common.unknown');
                        titleNode = (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium leading-none shrink-0">
                              {isLent ? t('add.lent', '借出') : t('add.borrowed', '借入')}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[120px] truncate leading-none shrink-0">
                              {contactName}
                            </span>
                          </div>
                        );
                      } else {
                        titleNode = (
                          <span className="text-sm font-medium leading-none truncate text-foreground">
                            {categoryMap.get(tx.category) || tx.note || t('common.uncategorized')}
                          </span>
                        );
                      }

                      const noteText =
                        tx.note && (isTransfer || isLoan || tx.note !== categoryMap.get(tx.category))
                          ? tx.note
                          : undefined;
                      const tagNames = tx.tagIds
                        ?.map((id) => tagMap.get(id))
                        .filter(Boolean) as string[] | undefined;

                      return (
                        <div
                          key={tx.id}
                          onClick={() => setSelectedTransactionId(tx.id)}
                          className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                        >
                          <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                            <div className="h-5 flex items-center gap-1.5 min-w-0">
                              {titleNode}
                            </div>
                            <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                              <span className="font-mono shrink-0">{tx.date}</span>
                              {tagNames && tagNames.length > 0 && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {tagNames.map((name) => (
                                    <span
                                      key={name}
                                      className="px-1 py-0.2 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/60 leading-none"
                                    >
                                      #{name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {noteText && (
                                <>
                                  <span className="text-muted-foreground/40 shrink-0">·</span>
                                  <span className="truncate">{noteText}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-center shrink-0">
                            <div className="h-5 flex items-center justify-end">
                              <AmountDisplay
                                amount={isExpense ? -tx.amount : tx.amount}
                                baseCurrency={tx.originalCurrency || baseCurrency}
                                type={isExpense ? 'expense' : isIncome ? 'income' : 'neutral'}
                                showSign={isExpense}
                                className="text-sm font-mono leading-none"
                              />
                            </div>
                            {!isTransfer && (
                              <div className="h-4 flex items-center justify-end text-xs text-muted-foreground truncate mt-1 max-w-[120px]">
                                {accountMap.get(tx.accountId) || ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 帳戶結果組 */}
              {matchedAccounts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    <span>{t('search.sections.accounts', '資產帳戶')}</span>
                    {matchedAccounts.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('accounts')}
                        className="hover:text-foreground cursor-pointer transition-colors"
                      >
                        {t('search.viewAll', { count: matchedAccounts.length })}
                      </button>
                    )}
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                    {matchedAccounts.slice(0, 3).map((acc) => (
                      <div
                        key={acc.id}
                        onClick={() => navigate(`/accounts/${acc.id}`)}
                        className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                      >
                        <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                          <div className="h-5 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium leading-none truncate text-foreground">
                              {acc.name}
                            </span>
                          </div>
                          <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                            <span className="font-mono">{acc.currency}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                          <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 預算結果組 */}
              {matchedBudgets.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    <span>{t('search.sections.budgets', '預算計劃')}</span>
                    {matchedBudgets.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('budgets')}
                        className="hover:text-foreground cursor-pointer transition-colors"
                      >
                        {t('search.viewAll', { count: matchedBudgets.length })}
                      </button>
                    )}
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                    {matchedBudgets.slice(0, 3).map((budget) => (
                      <div
                        key={budget.id}
                        onClick={() => navigate(`/budgets/${budget.id}`)}
                        className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                      >
                        <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                          <div className="h-5 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium leading-none truncate text-foreground">
                              {budget.name}
                            </span>
                          </div>
                          <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                            <span className="font-mono">{budget.startDate} ~ {budget.endDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                          <AmountDisplay
                            amount={budget.amount}
                            baseCurrency={baseCurrency}
                            showSign={false}
                            className="text-sm font-mono leading-none"
                          />
                          <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 對象結果組 */}
              {matchedContacts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    <span>{t('search.sections.contacts', '往來對象')}</span>
                    {matchedContacts.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('contacts')}
                        className="hover:text-foreground cursor-pointer transition-colors"
                      >
                        {t('search.viewAll', { count: matchedContacts.length })}
                      </button>
                    )}
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                    {matchedContacts.slice(0, 3).map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                        className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                      >
                        <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                          <div className="h-5 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium leading-none truncate text-foreground">
                              {contact.name}
                            </span>
                          </div>
                          <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                            <span>
                              {contact.group === 'organization'
                                ? t('contacts.organization', '組織機構')
                                : t('contacts.individual', '個人聯絡人')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                          <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* === B. 單獨交易視圖 (Transactions Tab) === */}
          {activeTab === 'transactions' && (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1">
                {t('search.resultsCount', { count: matchedTransactions.length })}
              </div>
              {matchedTransactions.length === 0 ? (
                <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">
                  {t('dashboard.noActivity')}
                </div>
              ) : (
                <GroupedTransactionList
                  transactions={matchedTransactions}
                  showDailyBalance={true}
                  onTransactionClick={(tx) => setSelectedTransactionId(tx.id)}
                />
              )}
            </div>
          )}

          {/* === C. 單獨帳戶視圖 (Accounts Tab) === */}
          {activeTab === 'accounts' && (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1">
                {t('search.resultsCount', { count: matchedAccounts.length })}
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                {matchedAccounts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    {t('accounts.noAccounts', '尚無帳戶')}
                  </div>
                ) : (
                  matchedAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      onClick={() => navigate(`/accounts/${acc.id}`)}
                      className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                    >
                      <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                        <div className="h-5 flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium leading-none truncate text-foreground">
                            {acc.name}
                          </span>
                        </div>
                        <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                          <span className="font-mono">{acc.currency}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                        <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* === D. 單獨預算視圖 (Budgets Tab) === */}
          {activeTab === 'budgets' && (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1">
                {t('search.resultsCount', { count: matchedBudgets.length })}
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                {matchedBudgets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    {t('budgets.noBudgets', '尚無預算')}
                  </div>
                ) : (
                  matchedBudgets.map((budget) => (
                    <div
                      key={budget.id}
                      onClick={() => navigate(`/budgets/${budget.id}`)}
                      className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                    >
                      <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                        <div className="h-5 flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium leading-none truncate text-foreground">
                            {budget.name}
                          </span>
                        </div>
                        <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                          <span className="font-mono">{budget.startDate} ~ {budget.endDate}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                        <AmountDisplay
                          amount={budget.amount}
                          baseCurrency={baseCurrency}
                          showSign={false}
                          className="text-sm font-mono leading-none"
                        />
                        <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* === E. 單獨對象視圖 (Contacts Tab) === */}
          {activeTab === 'contacts' && (
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground px-1">
                {t('search.resultsCount', { count: matchedContacts.length })}
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
                {matchedContacts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    {t('contacts.noContacts', '尚無對象')}
                  </div>
                ) : (
                  matchedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                      className="w-full h-16 flex items-center justify-between px-4 transition-colors hover:bg-muted/10 group cursor-pointer text-left bg-card"
                    >
                      <div className="flex flex-col justify-center min-w-0 pr-3 overflow-hidden">
                        <div className="h-5 flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium leading-none truncate text-foreground">
                            {contact.name}
                          </span>
                        </div>
                        <div className="h-4 flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-1">
                          <span>
                            {contact.group === 'organization'
                              ? t('contacts.organization', '組織機構')
                              : t('contacts.individual', '個人聯絡人')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground group-hover:text-foreground shrink-0">
                        <ArrowRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 交易詳情彈窗（平級兄弟節點） */}
      <TransactionDetailsDialog
        transactionId={selectedTransactionId}
        onClose={() => setSelectedTransactionId(null)}
      />
    </div>
  );
}
