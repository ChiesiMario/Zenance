import { db, type Wallet, type Category } from '@/services/db/db';
import type { IntegrityReport } from './integrityTypes';

/**
 * 依據診斷報告執行原子級資料庫自癒修復 (Atomic Self-Healing)
 */
export async function repairDatabaseIntegrity(
  report: IntegrityReport
): Promise<{ success: boolean; repairedCount: number; errors?: string[] }> {
  if (report.issues.length === 0) {
    return { success: true, repairedCount: 0 };
  }

  const fixableIssues = report.issues.filter((i) => i.autoFixable);
  if (fixableIssues.length === 0) {
    return { success: true, repairedCount: 0 };
  }

  let repairedCount = 0;
  const errors: string[] = [];

  try {
    await db.transaction(
      'rw',
      [
        db.ledgers,
        db.transactions,
        db.categories,
        db.accounts,
        db.contacts,
        db.budgets,
        db.budget_rules,
        db.balance_snapshots,
      ],
      async () => {
        const now = new Date().toISOString();
        const createdWalletIds = new Set<string>();
        const createdCategoryIds = new Set<string>();

        // 取得預設帳本 ID 備用
        const defaultLedger =
          (await db.ledgers.filter((l) => l.isDefault && !l.deleted).first()) ||
          (await db.ledgers.filter((l) => !l.deleted).first());
        const fallbackLedgerId = defaultLedger?.id || 'default';

        for (const issue of fixableIssues) {
          try {
            switch (issue.code) {
              case 'DANGLING_WALLET': {
                // 用戶指定需求：直接建立一個命名為該 ID 的錢包帳戶
                const missingId = issue.relatedId || issue.metadata?.missingId;
                if (!missingId || createdWalletIds.has(missingId)) break;

                const ledgerId = issue.metadata?.ledgerId || fallbackLedgerId;
                const newWallet: Wallet = {
                  id: missingId,
                  ledgerId,
                  name: missingId, // 直接命名為 ID
                  type: 'wallet',
                  group: 'other',
                  isDefault: false,
                  initialBalance: 0,
                  createdAt: now,
                  updatedAt: now,
                  deleted: false,
                };

                await db.accounts.put(newWallet);
                createdWalletIds.add(missingId);
                repairedCount++;
                break;
              }

              case 'DANGLING_CATEGORY': {
                // 用戶指定需求：直接建立一個命名為該 ID 的分類
                const missingId = issue.relatedId || issue.metadata?.missingId;
                if (!missingId || createdCategoryIds.has(missingId)) break;

                const ledgerId = issue.metadata?.ledgerId || fallbackLedgerId;
                const txType = issue.metadata?.txType === 'income' ? 'income' : 'expense';

                const newCat: Category = {
                  id: missingId,
                  ledgerId,
                  name: missingId, // 直接命名為 ID
                  type: txType,
                  isDefault: false,
                  createdAt: now,
                  updatedAt: now,
                  deleted: false,
                };

                await db.categories.put(newCat);
                createdCategoryIds.add(missingId);
                repairedCount++;
                break;
              }

              case 'PRECISION_DRIFT': {
                // 清洗數值浮點數精度漂移或 NaN
                const field = issue.metadata?.field;
                const cleanValue = issue.metadata?.cleanValue ?? 0;
                if (field && issue.recordId) {
                  await db.transactions.update(issue.recordId, {
                    [field]: cleanValue,
                    updatedAt: now,
                  });
                  repairedCount++;
                }
                break;
              }

              case 'SNAPSHOT_DRIFT': {
                // 以真實歷史流水加總校準快照收盤餘額
                const expected = issue.metadata?.expected;
                if (typeof expected === 'number' && issue.recordId) {
                  await db.balance_snapshots.update(issue.recordId, {
                    closingBalance: expected,
                    updatedAt: now,
                  });
                  repairedCount++;
                }
                break;
              }

              case 'ORPHAN_SPLIT_GROUP': {
                // 解開孤島分攤群組為普通交易
                if (issue.recordId) {
                  await db.transactions.update(issue.recordId, {
                    splitGroupId: undefined,
                    updatedAt: now,
                  });
                  repairedCount++;
                }
                break;
              }

              case 'MULTIPLE_DEFAULTS': {
                // 仲裁多預設：僅保留一筆
                const ids: string[] = issue.metadata?.ids || [];
                if (ids.length > 1) {
                  if (issue.table === 'ledgers') {
                    // 保留最後一個，其餘取消預設
                    for (let idx = 0; idx < ids.length - 1; idx++) {
                      await db.ledgers.update(ids[idx], {
                        isDefault: false,
                        updatedAt: now,
                      });
                      repairedCount++;
                    }
                  } else if (issue.table === 'accounts') {
                    for (let idx = 1; idx < ids.length; idx++) {
                      await db.accounts.update(ids[idx], {
                        isDefault: false,
                        updatedAt: now,
                      });
                      repairedCount++;
                    }
                  }
                }
                break;
              }

              default:
                break;
            }
          } catch (err: any) {
            errors.push(`修復項目 ${issue.id} 失敗: ${err?.message || '未知錯誤'}`);
          }
        }
      }
    );

    return {
      success: errors.length === 0,
      repairedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (txError: any) {
    console.error('Database healing transaction aborted:', txError);
    return {
      success: false,
      repairedCount: 0,
      errors: [txError?.message || '事務提交失敗，已全數回滾'],
    };
  }
}
