import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  queryTransactionsByCursor,
  type TransactionCursor,
} from '@/services/db/transactionQueries';
import type { Transaction } from '@/services/db/db';

export function usePaginatedTransactions(pageSize = 50) {
  const { activeLedgerId } = useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<TransactionCursor | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const isFetchingRef = useRef(false);

  // 載入第一頁
  const loadFirstPage = useCallback(async () => {
    if (!activeLedgerId) {
      setTransactions([]);
      setCursor(null);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    isFetchingRef.current = true;
    try {
      const result = await queryTransactionsByCursor({
        ledgerId: activeLedgerId,
        cursor: null,
        pageSize,
      });

      setTransactions(result.items);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [activeLedgerId, pageSize]);

  // 載入下一頁 (游標推進)
  const loadMore = useCallback(async () => {
    if (!activeLedgerId || !hasMore || isFetchingRef.current || !cursor) {
      return;
    }

    setIsLoadingMore(true);
    isFetchingRef.current = true;
    try {
      const result = await queryTransactionsByCursor({
        ledgerId: activeLedgerId,
        cursor,
        pageSize,
      });

      setTransactions((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [activeLedgerId, hasMore, cursor, pageSize]);

  // 帳本切換時重設並重新載入首頁
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  return {
    transactions,
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
    reload: loadFirstPage,
  };
}
