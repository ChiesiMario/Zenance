import { useMemo } from 'react';
import type { Category, Transaction } from '@/services/db/db';

export interface NoteSuggestionItem {
  id: string;
  note: string;
  categoryId?: string;
  categoryName?: string;
  categoryType?: 'expense' | 'income';
  count: number;
  lastUsedTime: number;
}

export interface UseNoteSuggestionsOptions {
  query: string;
  type: 'expense' | 'income' | 'transfer' | 'loan';
  transactions?: Transaction[];
  categories?: Category[];
  maxSuggestions?: number;
}

/**
 * 智慧歷史備註與分類聯想 Hook
 * 從歷史交易記錄中提取最常使用、最具關聯性的 (備註, 分類) 組合
 */
export function useNoteSuggestions({
  query,
  type,
  transactions,
  categories,
  maxSuggestions = 5,
}: UseNoteSuggestionsOptions) {
  return useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery || !transactions || transactions.length === 0) {
      return [];
    }

    const categoryMap = new Map<string, Category>();
    categories?.forEach(c => {
      categoryMap.set(c.id, c);
    });

    // 1. 聚類歷史備註與分類組合
    const clusterMap = new Map<
      string,
      {
        note: string;
        categoryId?: string;
        count: number;
        lastUsedTime: number;
      }
    >();

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    for (const tx of transactions) {
      if (tx.deleted || !tx.note || tx.type !== type) continue;
      const rawNote = tx.note.trim();
      if (!rawNote) continue;

      const lowerNote = rawNote.toLowerCase();
      // 快速包含過濾
      if (!lowerNote.includes(cleanQuery)) continue;

      const catId = tx.category || '';
      const key = `${catId}:::${lowerNote}`;
      const txTime = new Date(tx.date).getTime() || 0;

      const existing = clusterMap.get(key);
      if (existing) {
        existing.count += 1;
        if (txTime > existing.lastUsedTime) {
          existing.lastUsedTime = txTime;
          existing.note = rawNote; // 保留最近一次使用的原始大小寫
        }
      } else {
        clusterMap.set(key, {
          note: rawNote,
          categoryId: catId || undefined,
          count: 1,
          lastUsedTime: txTime,
        });
      }
    }

    if (clusterMap.size === 0) return [];

    // 2. 評分與排序 (Match Quality + Recency + Frequency)
    const results: Array<NoteSuggestionItem & { score: number }> = [];

    clusterMap.forEach((item, key) => {
      const lowerNote = item.note.toLowerCase();
      let matchScore = 0;

      if (lowerNote === cleanQuery) {
        matchScore = 100;
      } else if (lowerNote.startsWith(cleanQuery)) {
        matchScore = 60;
      } else {
        matchScore = 20;
      }

      let recencyBonus = 0;
      if (item.lastUsedTime >= thirtyDaysAgo) {
        recencyBonus = 15;
      } else if (item.lastUsedTime >= ninetyDaysAgo) {
        recencyBonus = 5;
      }

      const frequencyBonus = Math.min(25, item.count * 3);
      const score = matchScore + recencyBonus + frequencyBonus;

      const cat = item.categoryId ? categoryMap.get(item.categoryId) : undefined;

      results.push({
        id: key,
        note: item.note,
        categoryId: item.categoryId,
        categoryName: cat?.name,
        categoryType: cat?.type,
        count: item.count,
        lastUsedTime: item.lastUsedTime,
        score,
      });
    });

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxSuggestions);
  }, [query, type, transactions, categories, maxSuggestions]);
}
