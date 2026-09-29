export type IntegrityIssueCode =
  | 'DANGLING_WALLET'
  | 'DANGLING_CATEGORY'
  | 'PRECISION_DRIFT'
  | 'SNAPSHOT_DRIFT'
  | 'ORPHAN_SPLIT_GROUP'
  | 'MULTIPLE_DEFAULTS';

export interface IntegrityIssue {
  id: string; // 唯一問題識別碼
  code: IntegrityIssueCode;
  severity: 'low' | 'medium' | 'high';
  table: string;
  recordId: string;
  relatedId?: string; // 例如缺失的外鍵 ID
  description: string;
  suggestedAction: string;
  autoFixable: boolean;
  metadata?: Record<string, any>;
}

export interface IntegrityReport {
  status: 'healthy' | 'warning' | 'corrupted';
  score: number; // 0 ~ 100
  checkedAt: string;
  durationMs: number;
  totalRecordsScanned: number;
  issues: IntegrityIssue[];
  fixedCount: number;
}
