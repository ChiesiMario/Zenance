import type { Account, Transaction } from '@/services/db/db';

/**
 * 安全轉換任意金額從來源幣種至目標幣種
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  getRate: (from: string, to: string) => number
): number {
  if (!amount || fromCurrency === toCurrency) return amount;
  const rate = getRate(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * 計算單筆交易對特定帳戶在其「原生幣種」下的餘額影響數值 (Delta)。
 * 正數表示帳戶增加，負數表示帳戶減少，0 表示無影響。
 */
export function getTxAccountDelta(
  tx: Transaction,
  account: Account,
  getRate: (from: string, to: string) => number,
  baseCurrency: string = 'CNY'
): number {
  if (tx.deleted) return 0;

  const accId = account.id;
  const accCurrency = account.currency || baseCurrency;
  const isContact = account.type === 'contact';

  // 1. 支出交易 (Expense)
  if (tx.type === 'expense') {
    // 扣款錢包帳戶
    if (tx.accountId === accId) {
      const origCurr = tx.originalCurrency || accCurrency;
      const amountInAccCurr = origCurr === accCurrency
        ? tx.originalAmount
        : convertAmount(tx.originalAmount, origCurr, accCurrency, getRate);
      return -amountInAccCurr;
    }

    // 若此支出為代付 (Pending Reimbursement)，代付對象 (聯絡人) 持有應收債權
    if (
      isContact &&
      tx.reimbursementStatus === 'pending' &&
      tx.reimbursementContactId === accId
    ) {
      const origCurr = tx.originalCurrency || accCurrency;
      const amountInAccCurr = origCurr === accCurrency
        ? tx.originalAmount
        : convertAmount(tx.originalAmount, origCurr, accCurrency, getRate);
      return amountInAccCurr;
    }

    return 0;
  }

  // 2. 收入交易 (Income)
  if (tx.type === 'income') {
    if (tx.accountId === accId) {
      const origCurr = tx.originalCurrency || accCurrency;
      const amountInAccCurr = origCurr === accCurrency
        ? tx.originalAmount
        : convertAmount(tx.originalAmount, origCurr, accCurrency, getRate);
      return amountInAccCurr;
    }
    return 0;
  }

  // 3. 轉帳 (Transfer) 或 借貸 (Loan)
  if (tx.type === 'transfer' || tx.type === 'loan') {
    // 若為贈與交易 (isGift)，聯絡人端不產生應收/應還債權
    if (tx.isGift && isContact) {
      return 0;
    }

    // 來源帳戶 (轉出 / 貸出方)
    if (tx.accountId === accId) {
      const origCurr = tx.originalCurrency || accCurrency;
      const amountInAccCurr = origCurr === accCurrency
        ? tx.originalAmount
        : convertAmount(tx.originalAmount, origCurr, accCurrency, getRate);
      return -amountInAccCurr;
    }

    // 目標帳戶 (轉入 / 借入方)
    if (tx.toAccountId === accId) {
      const receivedAmount = tx.transferInAmount ?? tx.originalAmount;
      // 若有 transferInAmount，預設以目標帳戶原生幣種計，否則以原始交易幣種折算
      if (tx.transferInAmount !== undefined) {
        return receivedAmount;
      }
      const origCurr = tx.originalCurrency || accCurrency;
      const amountInAccCurr = origCurr === accCurrency
        ? receivedAmount
        : convertAmount(receivedAmount, origCurr, accCurrency, getRate);
      return amountInAccCurr;
    }

    return 0;
  }

  return 0;
}

/**
 * 批次精確計算所有帳戶在各自「原生幣種」下的當前餘額字典。
 */
export function calculateAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  getRate: (from: string, to: string) => number,
  baseCurrency: string = 'CNY'
): Record<string, number> {
  const balances: Record<string, number> = {};
  if (!accounts || accounts.length === 0) return balances;

  const accountMap = new Map<string, Account>();
  accounts.forEach(acc => {
    accountMap.set(acc.id, acc);
    balances[acc.id] = acc.initialBalance || 0;
  });

  if (!transactions || transactions.length === 0) return balances;

  transactions.forEach(tx => {
    if (tx.deleted) return;

    // 檢查來源帳戶
    if (tx.accountId && accountMap.has(tx.accountId)) {
      const acc = accountMap.get(tx.accountId)!;
      balances[tx.accountId] += getTxAccountDelta(tx, acc, getRate, baseCurrency);
    }

    // 檢查目標帳戶
    if (tx.toAccountId && accountMap.has(tx.toAccountId) && tx.toAccountId !== tx.accountId) {
      const toAcc = accountMap.get(tx.toAccountId)!;
      balances[tx.toAccountId] += getTxAccountDelta(tx, toAcc, getRate, baseCurrency);
    }

    // 檢查待報銷代付對象 (若與 toAccountId 不同)
    if (
      tx.type === 'expense' &&
      tx.reimbursementStatus === 'pending' &&
      tx.reimbursementContactId &&
      tx.reimbursementContactId !== tx.accountId &&
      accountMap.has(tx.reimbursementContactId)
    ) {
      const contactAcc = accountMap.get(tx.reimbursementContactId)!;
      balances[tx.reimbursementContactId] += getTxAccountDelta(tx, contactAcc, getRate, baseCurrency);
    }
  });

  // 四捨五入處理浮點數精度
  Object.keys(balances).forEach(id => {
    balances[id] = Math.round(balances[id] * 100) / 100;
  });

  return balances;
}

