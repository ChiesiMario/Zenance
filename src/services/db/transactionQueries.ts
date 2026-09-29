import Dexie from 'dexie';
import { db, type Transaction } from '@/services/db/db';
import { sortTransactionsDesc } from '@/lib/utils';

export interface TransactionCursor {
  date: string;
  createdAt: string;
  id: string;
}

export interface CursorPageResult {
  items: Transaction[];
  nextCursor: TransactionCursor | null;
  hasMore: boolean;
}

/**
 * 計算指定月份的起止日期 (例如 "2026-09" -> "2026-09-01", "2026-09-30")
 */
export function getMonthBounds(yearMonth: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * 基於 [ledgerId+date] 複合索引，精確檢索指定月份的所有交易流水 (毫秒級 O(1) 視窗載入)
 */
export async function queryMonthTransactions(
  ledgerId: string,
  yearMonth: string
): Promise<Transaction[]> {
  if (!ledgerId || !yearMonth) return [];

  const { startDate, endDate } = getMonthBounds(yearMonth);

  const list = await db.transactions
    .where('[ledgerId+date]')
    .between([ledgerId, startDate], [ledgerId, endDate], true, true)
    .filter((t) => !t.deleted)
    .toArray();

  return sortTransactionsDesc(list);
}

/**
 * 基於 [ledgerId+date] 複合索引，檢索任意自訂日期區間的交易流水
 */
export async function queryDateRangeTransactions(
  ledgerId: string,
  startDate: string,
  endDate: string
): Promise<Transaction[]> {
  if (!ledgerId) return [];

  const list = await db.transactions
    .where('[ledgerId+date]')
    .between([ledgerId, startDate], [ledgerId, endDate], true, true)
    .filter((t) => !t.deleted)
    .toArray();

  return sortTransactionsDesc(list);
}

/**
 * 時間窗口游標分頁查詢核心演算法 (Cursor-based Pagination Engine)
 * 解決同一天多筆交易時換頁重複或漏查的邊界破綻 (Deterministic Tie-Breaking Cursor)
 */
export async function queryTransactionsByCursor({
  ledgerId,
  cursor,
  pageSize = 50,
}: {
  ledgerId: string;
  cursor?: TransactionCursor | null;
  pageSize?: number;
}): Promise<CursorPageResult> {
  if (!ledgerId) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  // 1. 定位 B-Tree 索引的日期起點
  // 如果沒有 cursor，代表第一頁，從正無窮大日期 (Dexie.maxKey) 開始向下掃描
  const upperDate = cursor ? cursor.date : Dexie.maxKey;

  // 為了防止同一天多筆帳目被截斷，多抓取緩衝數量
  const fetchLimit = pageSize + 20;

  const rawList = await db.transactions
    .where('[ledgerId+date]')
    .between([ledgerId, Dexie.minKey], [ledgerId, upperDate], true, true)
    .filter((t) => !t.deleted)
    .reverse() // 依日期倒序排列 (最新的在前)
    .limit(fetchLimit)
    .toArray();

  // 2. 嚴格複合排序 (date desc -> createdAt desc -> id desc)
  const sorted = sortTransactionsDesc(rawList);

  // 3. 游標精準剔除：若存在 cursor，過濾掉排序在 cursor 之前或相同的記錄
  let filtered = sorted;
  if (cursor) {
    filtered = sorted.filter((t) => {
      // 日期嚴格小於游標日期者保留
      if (t.date < cursor.date) return true;
      if (t.date > cursor.date) return false;

      // 日期相同，比對 createdAt
      const tCreated = t.createdAt || '';
      if (tCreated < cursor.createdAt) return true;
      if (tCreated > cursor.createdAt) return false;

      // 日期與建立時間皆相同，比對 UUID tie-breaker
      return t.id < cursor.id;
    });
  }

  // 4. 截取當前頁大小
  const items = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;

  let nextCursor: TransactionCursor | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = {
      date: lastItem.date,
      createdAt: lastItem.createdAt || lastItem.date,
      id: lastItem.id,
    };
  }

  return {
    items,
    nextCursor,
    hasMore,
  };
}
