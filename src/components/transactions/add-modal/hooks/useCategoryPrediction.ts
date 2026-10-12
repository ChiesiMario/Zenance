import { useMemo, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { predictCategoryFromNote } from '@/lib/categoryPredictor';
import type { Category, Transaction } from '@/services/db/db';
import type { TransactionType } from '../types';

interface UseCategoryPredictionParams {
  currentNote: string;
  type: TransactionType;
  filteredCategories: Category[];
  transactions?: Transaction[];
  isUserSelectedCat: boolean;
  selectedCategoryId?: string;
  onApplyPredictedCategory: (categoryId: string) => void;
}

export function useCategoryPrediction({
  currentNote,
  type,
  filteredCategories,
  transactions,
  isUserSelectedCat,
  selectedCategoryId,
  onApplyPredictedCategory,
}: UseCategoryPredictionParams) {
  // 智慧分類記憶排序 (Smart Category Frequency & Recency)
  const categoryFrequencyStats = useMemo(() => {
    const stats: Record<string, { recentCount: number; totalCount: number; lastUsedTime: number }> = {};
    if (!transactions) return stats;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    transactions.forEach((t) => {
      if (t.deleted || !t.category || t.type !== type) return;

      if (!stats[t.category]) {
        stats[t.category] = { recentCount: 0, totalCount: 0, lastUsedTime: 0 };
      }

      stats[t.category].totalCount += 1;
      const txTime = new Date(t.date).getTime();
      if (txTime >= thirtyDaysAgo) {
        stats[t.category].recentCount += 1;
      }
      if (txTime > stats[t.category].lastUsedTime) {
        stats[t.category].lastUsedTime = txTime;
      }
    });

    return stats;
  }, [transactions, type]);

  const frequentCategories = useMemo(() => {
    return [...filteredCategories].sort((a, b) => {
      const statA = categoryFrequencyStats[a.id];
      const statB = categoryFrequencyStats[b.id];

      // 綜合頻率評分：近 30 天使用次數權重 x3 + 歷史總次數
      const scoreA = (statA?.recentCount || 0) * 3 + (statA?.totalCount || 0);
      const scoreB = (statB?.recentCount || 0) * 3 + (statB?.totalCount || 0);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // 頻率相同時，以最後使用日期（Recency）優先
      const lastA = statA?.lastUsedTime || 0;
      const lastB = statB?.lastUsedTime || 0;
      if (lastA !== lastB) {
        return lastB - lastA;
      }

      // 未曾使用過時，預設分類優先，再按名稱自然排序
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredCategories, categoryFrequencyStats]);

  // 智慧語意預測：備註反向推斷分類
  const predictedResult = useMemo(() => {
    if (!currentNote.trim() || (type !== 'expense' && type !== 'income')) return null;
    return predictCategoryFromNote(currentNote, type, filteredCategories, transactions || []);
  }, [currentNote, type, filteredCategories, transactions]);

  // 當使用者未手動指定過分類時，若產生高信心預測，自動切換並給予輕微觸覺反饋
  useEffect(() => {
    if (predictedResult && !isUserSelectedCat) {
      if (selectedCategoryId !== predictedResult.category.id) {
        onApplyPredictedCategory(predictedResult.category.id);
        triggerHaptic('light');
      }
    }
  }, [predictedResult, isUserSelectedCat, selectedCategoryId, onApplyPredictedCategory]);

  const displayedPills = useMemo(() => {
    let list = [...frequentCategories];
    const targetCat = predictedResult
      ? predictedResult.category
      : selectedCategoryId
      ? filteredCategories.find((c) => c.id === selectedCategoryId)
      : null;

    if (targetCat) {
      list = [targetCat, ...list.filter((c) => c.id !== targetCat.id)];
    }
    return list.slice(0, 4);
  }, [frequentCategories, predictedResult, selectedCategoryId, filteredCategories]);

  return {
    predictedResult,
    frequentCategories,
    displayedPills,
  };
}
