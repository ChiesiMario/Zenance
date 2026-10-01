import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, sortTransactionsDesc } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import type { Transaction } from '@/services/db/db';

interface Props {
  transactionId: string | null;
  onClose: () => void;
}

export function TransactionDetailsDialog({ transactionId, onClose }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { transactions, deleteTransaction } = useTransactions();
  const { allCategories } = useCategories();
  const { accounts, wallets, allWallets, contacts, allContacts } = useAccounts();
  const { activeLedgerId, setEditingTransactionId, openAddModal } = useAppStore();
  const { ledgers } = useLedgers();

  // Active transaction ID within the group
  const [activeTxId, setActiveTxId] = useState<string | null>(transactionId);
  const touchStartX = useRef<number>(0);

  useEffect(() => {
    setActiveTxId(transactionId);
  }, [transactionId]);

  const currentTransaction = useMemo(() => {
    if (!activeTxId || !transactions) return null;
    return transactions.find((tx) => tx.id === activeTxId) || null;
  }, [activeTxId, transactions]);

  // Find all sibling/related transactions in the same group (split group or transfer + fee)
  const groupTransactions = useMemo(() => {
    if (!currentTransaction || !transactions) return [];

    // By splitGroupId (AA / Split expense or Transfer + Fee)
    if (currentTransaction.splitGroupId) {
      const list = transactions.filter(
        (t) => !t.deleted && t.splitGroupId === currentTransaction.splitGroupId
      );
      return sortTransactionsDesc(list);
    }

    return [currentTransaction];
  }, [currentTransaction, transactions]);

  const currentIndex = useMemo(() => {
    if (!currentTransaction || groupTransactions.length === 0) return 0;
    const idx = groupTransactions.findIndex((t) => t.id === currentTransaction.id);
    return idx >= 0 ? idx : 0;
  }, [currentTransaction, groupTransactions]);

  // Single card width = 320px, gap = 24px
  const CARD_WIDTH = 320;
  const CARD_GAP = 24;

  const totalTrackWidth = useMemo(() => {
    const n = groupTransactions.length;
    if (n === 0) return CARD_WIDTH;
    return n * CARD_WIDTH + (n - 1) * CARD_GAP;
  }, [groupTransactions.length]);

  const trackCenter = totalTrackWidth / 2;

  const activeCardCenter = useMemo(() => {
    return currentIndex * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
  }, [currentIndex]);

  const centerTranslateX = -(activeCardCenter - trackCenter);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setActiveTxId(groupTransactions[currentIndex - 1].id);
    }
  }, [currentIndex, groupTransactions]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < groupTransactions.length - 1) {
      setActiveTxId(groupTransactions[currentIndex + 1].id);
    }
  }, [currentIndex, groupTransactions]);

  // Keyboard arrow navigation
  useEffect(() => {
    if (!transactionId || groupTransactions.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transactionId, groupTransactions, handlePrev, handleNext]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (groupTransactions.length <= 1) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 45) {
      handlePrev();
    } else if (diff < -45) {
      handleNext();
    }
  };

  const activeLedger = ledgers?.find((l) => l.id === activeLedgerId);

  const getAccountName = useCallback((id?: string) => {
    if (!id) return '';
    const wallet = (allWallets || wallets || accounts)?.find((a) => a.id === id);
    if (wallet) return wallet.name;
    const contact = (allContacts || contacts)?.find((c) => c.id === id);
    if (contact) return contact.name;
    return id;
  }, [allWallets, wallets, accounts, allContacts, contacts]);

  const getContact = useCallback((id?: string) => {
    if (!id) return undefined;
    return (allContacts || contacts)?.find((c) => c.id === id);
  }, [allContacts, contacts]);

  const getCategoryName = (categoryId: string, tx: Transaction) => {
    if (categoryId === 'transfer') return t('add.transfer');
    if (categoryId === 'advance' || (tx.type === 'loan' && tx.category === 'advance')) {
      return t('add.reimburse', '代付');
    }
    if (categoryId === 'loan') {
      if (tx.type === 'loan') {
        const isLent = (allContacts || contacts)?.some((c) => c.id === tx.toAccountId);
        return isLent ? t('add.lent') : t('add.borrowed');
      }
      return t('add.loan');
    }
    const cat = allCategories?.find((c) => c.id === categoryId);
    if (cat?.isSystem) {
      return t('accounts.balanceAdjustment');
    }
    if (
      cat?.name &&
      (cat.name.includes('差額吸收') ||
        cat.name.includes('差额吸收') ||
        cat.name === '抹零' ||
        cat.name.toLowerCase().includes('write-off'))
    ) {
      return t('reimbursements.writeOffCategory', '抹零');
    }
    return cat?.name || categoryId;
  };

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoStr;
    }
  };

  // Generate barcode bars based on transaction reference
  const getBarcodeBars = (seedStr: string) => {
    const seed = seedStr.replace(/-/g, '').toUpperCase();
    const bars: { x: number; width: number }[] = [];
    let currentX = 14;

    bars.push({ x: currentX, width: 2 });
    currentX += 4;
    bars.push({ x: currentX, width: 1.5 });
    currentX += 4;

    for (let i = 0; i < seed.length && currentX < 182; i++) {
      const code = seed.charCodeAt(i);
      const w1 = (code % 3) + 1;
      const s1 = ((code >> 1) % 2) + 2;
      const w2 = ((code >> 2) % 2) + 1;
      const s2 = 2;

      bars.push({ x: currentX, width: w1 });
      currentX += w1 + s1;
      if (currentX >= 180) break;
      bars.push({ x: currentX, width: w2 });
      currentX += w2 + s2;
    }

    bars.push({ x: 184, width: 1.5 });
    bars.push({ x: 188, width: 2 });

    return bars;
  };

  const handleDelete = async () => {
    if (!activeTxId || !currentTransaction) return;

    const description = t('dashboard.deleteTransactionConfirm');

    const confirmed = await confirm({
      title: t('dashboard.deleteTransaction'),
      description,
      confirmText: t('common.delete'),
      variant: 'destructive',
    });

    if (!confirmed) return;

    await deleteTransaction(activeTxId);

    // If there are other items in the group, switch to sibling; otherwise close
    if (groupTransactions.length > 1) {
      if (currentIndex > 0) {
        setActiveTxId(groupTransactions[currentIndex - 1].id);
      } else if (currentIndex < groupTransactions.length - 1) {
        setActiveTxId(groupTransactions[currentIndex + 1].id);
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleRefund = () => {
    if (!currentTransaction) return;

    // 支出退款轉為收款/收入，收入退款轉為支出
    const refundType = currentTransaction.type === 'expense' ? 'income' : 'expense';
    const refundAmount = currentTransaction.originalAmount ?? currentTransaction.amount;
    const catName = getCategoryName(currentTransaction.category, currentTransaction);
    const prefix = t('dashboard.refundPrefix', '退款：');
    const refundNote = currentTransaction.note 
      ? `${prefix}${currentTransaction.note}` 
      : `${prefix}${catName}`;

    onClose();
    openAddModal(
      refundType,
      'borrow',
      undefined,
      currentTransaction.toAccountId || undefined,
      refundAmount,
      currentTransaction.accountId,
      currentTransaction.category,
      refundNote
    );
  };

  /**
   * Render an authentic paper receipt card
   */
  const renderCard = (tx: Transaction, idx: number) => {
    const isActive = tx.id === activeTxId;
    const displayRef = tx.displayId || tx.id.split('-')[0].toUpperCase();
    const categoryTitle = getCategoryName(tx.category, tx);
    const barcode = getBarcodeBars(displayRef + tx.id);

    // Associated contact for this specific card
    const walletList = allWallets || wallets || accounts;
    const contactList = allContacts || contacts;

    const isLend =
      tx.type === 'loan' &&
      Boolean(contactList?.some((c) => c.id === tx.toAccountId));

    const contactId = tx.type === 'loan' ? (isLend ? tx.toAccountId : tx.accountId) : undefined;
    const contactObj = contactId ? (contactList?.find((c) => c.id === contactId) || null) : null;

    const fromCurrency =
      walletList?.find((a) => a.id === tx.accountId)?.currency ||
      contactList?.find((c) => c.id === tx.accountId)?.currency ||
      tx.originalCurrency ||
      activeLedger?.baseCurrency ||
      'CNY';

    const toCurrency =
      walletList?.find((a) => a.id === tx.toAccountId)?.currency ||
      contactList?.find((c) => c.id === tx.toAccountId)?.currency ||
      activeLedger?.baseCurrency ||
      'CNY';

    // Amount color, currency, and sign
    const isTransfer = tx.type === 'transfer';
    const isTransferFee =
      tx.type === 'expense' &&
      !!tx.splitGroupId &&
      groupTransactions.some((t) => t.type === 'transfer');
    const isLoan = tx.type === 'loan';
    const isDirectOriginal = isTransfer || isTransferFee || isLoan;
    const isLendLoan = tx.type === 'loan' && isLend;

    const isCrossCurrency = Boolean(
      (isTransfer || isLoan) && tx.toAccountId && fromCurrency !== toCurrency
    );
    const hasTransferIn = tx.transferInAmount !== undefined && tx.transferInAmount > 0;
    const isForeignFrom =
      fromCurrency !== (activeLedger?.baseCurrency || 'CNY') ||
      Boolean(tx.originalCurrency && tx.originalCurrency !== (activeLedger?.baseCurrency || 'CNY'));
    const isForeignTo = Boolean(
      tx.toAccountId && toCurrency !== (activeLedger?.baseCurrency || 'CNY')
    );
    const showCurrencyDetails = isCrossCurrency || isForeignFrom || isForeignTo || hasTransferIn;

    const inflowAmount = hasTransferIn
      ? tx.transferInAmount!
      : isCrossCurrency && tx.exchangeRate
      ? (tx.originalAmount ?? tx.amount) * tx.exchangeRate
      : (tx.originalAmount ?? tx.amount);

    const displayRate = tx.exchangeRate
      ? tx.exchangeRate.toFixed(4)
      : hasTransferIn && (tx.originalAmount ?? tx.amount) > 0
      ? (tx.transferInAmount! / (tx.originalAmount ?? tx.amount)).toFixed(4)
      : undefined;

    let cardAmount: number;
    let cardBaseCurrency: string;
    let cardType = isTransfer
      ? 'transfer'
      : isLendLoan || isTransferFee
      ? 'expense'
      : tx.type === 'loan'
      ? 'income'
      : tx.type;

    if ((isTransfer || (isLoan && !isLend)) && isForeignTo && toCurrency) {
      // 收款卡為外幣卡（轉帳或收款）：展示外幣卡實際收款到款金額 (例如 $1)
      cardAmount = inflowAmount;
      cardBaseCurrency = toCurrency;
    } else if (
      tx.type === 'income' &&
      (isForeignFrom || fromCurrency !== (activeLedger?.baseCurrency || 'CNY'))
    ) {
      // 外幣卡收款/收入：展示實際收到的外幣金額 (例如 $1)
      cardAmount = tx.originalAmount ?? tx.amount;
      cardBaseCurrency = fromCurrency;
      cardType = 'income';
    } else if (isDirectOriginal) {
      cardAmount = isLendLoan
        ? -(tx.originalAmount ?? tx.amount)
        : (tx.originalAmount ?? tx.amount);
      cardBaseCurrency =
        tx.originalCurrency || fromCurrency || activeLedger?.baseCurrency || 'CNY';
    } else {
      cardAmount = isLendLoan ? -tx.amount : tx.amount;
      cardBaseCurrency = activeLedger?.baseCurrency || 'CNY';
    }

    // Note validation
    const cat = allCategories?.find((c) => c.id === tx.category);
    const isAdj = !!cat?.isSystem;
    const isDefaultNote =
      tx.note === t('accounts.balanceAdjustmentNote') ||
      tx.note === '手動餘額調整' ||
      tx.note === '手动余额调整' ||
      tx.note === 'Manual Balance Adjustment';
    const hasNote = tx.note && !(isAdj && isDefaultNote);

    return (
      <div
        key={tx.id}
        onClick={(e) => {
          e.stopPropagation();
          if (!isActive) {
            setActiveTxId(tx.id);
          }
        }}
        className={cn(
          "w-[320px] shrink-0 bg-card text-card-foreground border border-border rounded-2xl shadow-none relative overflow-hidden transition-all duration-300",
          isActive
            ? "opacity-100 pointer-events-auto select-text cursor-default"
            : "opacity-30 hover:opacity-60 cursor-pointer pointer-events-auto select-none"
        )}
      >
        {/* Top Paper Header: Branding & Serial */}
        <div className="pt-5 px-5 pb-2.5 flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Logo size={18} showBorder={false} className="rounded shrink-0" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.25em] text-foreground">
              ZENANCE
            </span>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block mb-2.5">
            {t('receipt.voucherTitle', 'TRANSACTION RECEIPT')}
          </span>

          {/* Serial & Date Bar (shows group index if multiple cards) */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-3 border-b border-border/70 pb-2">
            <div className="flex items-center gap-1 font-semibold text-foreground">
              <span>#{displayRef}</span>
              {groupTransactions.length > 1 && (
                <span className="text-[10px] text-muted-foreground/60 font-normal">
                  ({idx + 1}/{groupTransactions.length})
                </span>
              )}
            </div>
            <span>{tx.date}</span>
          </div>
        </div>

        {/* Hero Amount & Category Section */}
        <div className="px-5 py-2 flex flex-col items-center text-center">
          {/* Category Capsule / Transfer Route & Status Badges */}
          <div className="flex items-center justify-center gap-1.5 mb-1.5 flex-wrap">
            {tx.type === 'transfer' ? (
              (() => {
                const fromName = getAccountName(tx.accountId);
                const toName = getAccountName(tx.toAccountId || '');
                return (
                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    <span
                      title={fromName}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                    >
                      {fromName}
                    </span>
                    <span className="text-muted-foreground/60 text-xs shrink-0 select-none">→</span>
                    <span
                      title={toName}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 max-w-[110px] truncate leading-none shrink-0"
                    >
                      {toName}
                    </span>
                  </div>
                );
              })()
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 leading-none shrink-0">
                {categoryTitle}
              </span>
            )}

            {/* [頭像 對象] 膠囊 */}
            {contactObj && (
              <span
                title={contactObj.name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-muted/60 text-foreground border border-border/80 leading-none shrink-0 max-w-[130px]"
              >
                <ContactAvatar
                  group={contactObj.group}
                  className="size-3 border-none bg-transparent p-0"
                  iconClassName="size-3 text-muted-foreground/70"
                />
                <span className="truncate">{contactObj.name}</span>
              </span>
            )}

            {tx.isGift && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 leading-none shrink-0">
                {t('add.gift', '贈與')}
              </span>
            )}
          </div>

          {/* Hero Amount Monospace Display */}
          <div className="text-3xl sm:text-4xl font-mono tracking-tighter font-extrabold select-all py-1.5 text-foreground leading-tight">
            <AmountDisplay
              amount={cardAmount}
              originalCurrency={isDirectOriginal ? undefined : tx.originalCurrency}
              baseCurrency={cardBaseCurrency}
              isApproximate={isDirectOriginal ? false : undefined}
              type={cardType as any}
            />
          </div>
        </div>

        {/* Ticket Notches & Dashed Perforation Line */}
        <div className="relative py-2 flex items-center justify-center -mx-5 my-0.5">
          {/* Left Notch */}
          <div className="absolute -left-[10px] size-5 rounded-full bg-background border border-border" />
          {/* Perforation Dashed Line */}
          <div className="w-full border-b border-dashed border-border" />
          {/* Right Notch */}
          <div className="absolute -right-[10px] size-5 rounded-full bg-background border border-border" />
        </div>

        {/* Dot Matrix Details Grid */}
        <div className="px-5 py-2 space-y-1.5 font-mono text-xs">
          {/* Column Title Row */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-1 mb-2">
            <span>{t('receipt.item', '項目')}</span>
            <span>{t('receipt.details', '明細')}</span>
          </div>

          {/* 出款 / 轉出帳戶 */}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="text-muted-foreground shrink-0">{t('add.lendFrom', '出款')}</span>
            <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
            <span className="font-medium text-foreground truncate max-w-[140px] text-right inline-flex items-center justify-end gap-1">
              {getContact(tx.accountId) && (
                <ContactAvatar
                  group={getContact(tx.accountId)?.group}
                  className="size-3 border-none bg-transparent p-0 shrink-0"
                  iconClassName="size-3 text-muted-foreground/70"
                />
              )}
              <span className="truncate">{getAccountName(tx.accountId)}</span>
            </span>
          </div>

          {/* 入款帳戶 (for transfer or loan) */}
          {(tx.type === 'transfer' || tx.type === 'loan') && tx.toAccountId && (
            <div className="flex items-baseline justify-between py-0.5">
              <span className="text-muted-foreground shrink-0">{t('add.borrowTo', '入款')}</span>
              <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
              <span className="font-medium text-foreground truncate max-w-[140px] text-right inline-flex items-center justify-end gap-1">
                {getContact(tx.toAccountId) && (
                  <ContactAvatar
                    group={getContact(tx.toAccountId)?.group}
                    className="size-3 border-none bg-transparent p-0 shrink-0"
                    iconClassName="size-3 text-muted-foreground/70"
                  />
                )}
                <span className="truncate">{getAccountName(tx.toAccountId)}</span>
              </span>
            </div>
          )}

          {/* 跨幣種 / 外幣交易明細 (原始金額、匯率、到款) */}
          {showCurrencyDetails && (
            <>
              {/* 原始金額 */}
              <div className="flex items-baseline justify-between py-0.5">
                <span className="text-muted-foreground shrink-0">{t('dashboard.original')}</span>
                <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
                <span className="font-medium text-foreground text-right">
                  {(tx.originalAmount ?? tx.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                  {fromCurrency}
                </span>
              </div>

              {/* 匯率 */}
              {displayRate && (
                <div className="flex items-baseline justify-between py-0.5">
                  <span className="text-muted-foreground shrink-0">{t('dashboard.rate')}</span>
                  <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
                  <span className="font-medium text-foreground text-right">
                    {displayRate}
                  </span>
                </div>
              )}

              {/* 到款金額 (限轉帳/入款或帶有入款帳戶) */}
              {(isCrossCurrency || hasTransferIn || (tx.toAccountId && isForeignTo)) && (
                <div className="flex items-baseline justify-between py-0.5">
                  <span className="text-muted-foreground shrink-0">{t('add.inflow', '到款')}</span>
                  <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
                  <span className="font-medium text-foreground text-right">
                    {inflowAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                    {toCurrency}
                  </span>
                </div>
              )}
            </>
          )}

          {/* 交易時間 (純日期) */}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="text-muted-foreground shrink-0">{t('add.transactionDate', '交易時間')}</span>
            <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
            <span className="font-medium text-foreground text-right">
              {tx.date}
            </span>
          </div>

          {/* 建立時間 */}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="text-muted-foreground shrink-0">{t('receipt.createdAt', '建立時間')}</span>
            <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
            <span className="font-medium text-foreground text-right text-[11px]">
              {formatDateTime(tx.createdAt)}
            </span>
          </div>

          {/* 修改時間 */}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="text-muted-foreground shrink-0">{t('receipt.updatedAt', '修改時間')}</span>
            <span className="flex-1 mx-2 border-b border-dotted border-border/80 self-center" />
            <span className="font-medium text-foreground text-right text-[11px]">
              {formatDateTime(tx.updatedAt)}
            </span>
          </div>

          {/* 備註留言區塊 */}
          {hasNote && (
            <div className="pt-2 border-t border-dashed border-border/70 flex flex-col gap-1 mt-1">
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">
                {t('add.note', '備註')}
              </span>
              <p className="font-sans text-xs text-foreground bg-muted/20 p-2 rounded border border-border/50 select-text break-words leading-relaxed">
                {tx.note}
              </p>
            </div>
          )}
        </div>

        {/* Barcode & Footer Receipt Section */}
        <div className="px-5 pt-3 pb-5 flex flex-col items-center text-center border-t border-border/60 mt-1">
          <svg
            className="w-44 h-7 opacity-85 dark:opacity-75 text-foreground"
            viewBox="0 0 200 32"
            fill="currentColor"
          >
            {barcode.map((b, bIdx) => (
              <rect key={bIdx} x={b.x} y={0} width={b.width} height={32} />
            ))}
          </svg>
          <span className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground mt-2.5">
            * {displayRef} *
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mt-1.5">
            ZENANCE · LOCAL-FIRST VOUCHER
          </span>
        </div>
      </div>
    );
  };

  if (!transactionId || !currentTransaction) return null;

  return (
    <Dialog open={!!transactionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !sm:max-w-none !p-0 !bg-transparent !border-none !shadow-none !outline-none !flex !flex-col !items-center !justify-center !gap-4 !overflow-visible !pointer-events-none select-none"
      >
        <DialogTitle className="sr-only">
          {t('receipt.voucherTitle', '交易憑證')} - #{currentTransaction.displayId || currentTransaction.id}
        </DialogTitle>

        {/* Global Backdrop Click Area (outside cards) */}
        <div
          className="fixed inset-0 z-0 cursor-pointer pointer-events-auto"
          onClick={onClose}
        />

        {/* ========================================================= */}
        {/* Unified Centering Carousel Track                          */}
        {/* ========================================================= */}
        <div
          className="relative z-10 w-full flex items-end justify-center overflow-visible pt-1 pb-0 pointer-events-auto cursor-pointer"
          onClick={onClose}
        >
          {groupTransactions.length <= 1 ? (
            // Single standalone card: centered
            <div className="p-0 flex items-end justify-center cursor-default" onClick={(e) => e.stopPropagation()}>
              {renderCard(currentTransaction, 0)}
            </div>
          ) : (
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="flex items-end gap-6 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default"
              style={{
                transform: `translateX(${centerTranslateX}px)`,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  onClose();
                }
              }}
            >
              {groupTransactions.map((tx, idx) => renderCard(tx, idx))}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* Scheme B2: 4-Column Segmented Minimal Dock Bar (Frosted)  */}
        {/* ========================================================= */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 w-[280px] select-none font-mono pointer-events-auto"
        >
          <div className="grid grid-cols-4 divide-x divide-border/40 border border-border/50 rounded-full bg-background/40 dark:bg-zinc-900/40 backdrop-blur-xl overflow-hidden text-xs">
            {/* 1. 刪除 (Delete) */}
            <button
              type="button"
              onClick={handleDelete}
              className="h-8.5 flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 active:bg-destructive/15 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
            >
              <span>{t('dashboard.delete')}</span>
            </button>

            {/* 2. 退款 (Refund) */}
            <button
              type="button"
              onClick={handleRefund}
              className="h-8.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
            >
              <span>{t('dashboard.refund', '退款')}</span>
            </button>

            {/* 3. 編輯 (Edit) */}
            <button
              type="button"
              onClick={() => {
                setEditingTransactionId(currentTransaction.id);
                onClose();
              }}
              className="h-8.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
            >
              <span>{t('dashboard.edit', '編輯')}</span>
            </button>

            {/* 4. 關閉 (Close) */}
            <button
              type="button"
              onClick={onClose}
              className="h-8.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
            >
              <span>{t('dashboard.close')}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
