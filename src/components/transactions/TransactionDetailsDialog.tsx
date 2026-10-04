import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAccounts } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/useAppStore';
import { useLedgers } from '@/hooks/useLedgers';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { AutoMarquee } from '@/components/ui/AutoMarquee';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, sortTransactionsDesc, formatAmountNumber, isBalanceAdjustmentTx } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { RefundDialog } from './RefundDialog';
import type { Transaction } from '@/services/db/db';

interface TreeBranchConnectorProps {
  count: number;
  cardWidth?: number;
  gap?: number;
  height?: number;
}

function TreeBranchConnector({
  count,
  cardWidth = 300,
  gap = 24,
  height = 56,
}: TreeBranchConnectorProps) {
  const targetY = height - 12; // Y = 44

  if (count <= 1) {
    return (
      <div
        style={{ height: `${height}px` }}
        className="flex items-center justify-center relative w-full overflow-visible shrink-0 pointer-events-none"
      >
        <svg
          width="32"
          height={height}
          viewBox={`0 0 32 ${height}`}
          className="text-border overflow-visible"
        >
          {/* 頂部源點 */}
          <circle cx="16" cy="0" r="2" className="fill-muted-foreground/40" />
          {/* 垂直直線 */}
          <line x1="16" y1="0" x2="16" y2={targetY} stroke="currentColor" strokeWidth="1.2" />
          {/* 終端環形微芯端點 */}
          <circle cx="16" cy={targetY} r="3" stroke="#10b981" strokeWidth="1.2" className="fill-card" />
          <circle cx="16" cy={targetY} r="1.2" className="fill-emerald-500" />
        </svg>
      </div>
    );
  }

  const span = cardWidth + gap;
  const totalWidth = (count - 1) * span;
  const svgWidth = totalWidth + 48;
  const centerX = svgWidth / 2;

  const childXs = Array.from({ length: count }, (_, idx) => {
    const offset = (idx - (count - 1) / 2) * span;
    return centerX + offset;
  });

  return (
    <div
      style={{ height: `${height}px` }}
      className="flex items-center justify-center relative w-full overflow-visible shrink-0 pointer-events-none"
    >
      <svg
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="text-border overflow-visible"
      >
        {/* 頂部中央節點：自然銜接父卡片底端 */}
        <circle cx={centerX} cy="0" r="2.5" className="fill-muted-foreground/50" />

        {/* 貝茲平滑分流曲線（Cubic Bezier S-Curve） */}
        {childXs.map((x, idx) => (
          <g key={idx}>
            <path
              d={`M ${centerX} 0 C ${centerX} ${targetY * 0.45}, ${x} ${targetY * 0.55}, ${x} ${targetY}`}
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* 終端環形微芯端點（Ring with Emerald Core） */}
            <circle cx={x} cy={targetY} r="3" stroke="#10b981" strokeWidth="1.2" className="fill-card" />
            <circle cx={x} cy={targetY} r="1.2" className="fill-emerald-500" />
          </g>
        ))}
      </svg>
    </div>
  );
}

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
  const { activeLedgerId, setEditingTransactionId } = useAppStore();
  const { ledgers } = useLedgers();

  // 1. 核心點擊交易與當前聚焦交易
  const [activeTxId, setActiveTxId] = useState<string | null>(transactionId);

  useEffect(() => {
    setActiveTxId(transactionId);
  }, [transactionId]);

  const currentTransaction = useMemo(() => {
    if (!activeTxId || !transactions) return null;
    return transactions.find((tx) => tx.id === activeTxId) || null;
  }, [activeTxId, transactions]);

  // 2. 獲取初始點擊交易的根節點
  const initialRootTx = useMemo(() => {
    if (!transactionId || !transactions) return null;
    const clicked = transactions.find((t) => t.id === transactionId);
    if (!clicked) return null;
    if (clicked.parentId) {
      return transactions.find((t) => t.id === clicked.parentId) || clicked;
    }
    return clicked;
  }, [transactionId, transactions]);

  // 3. 獲取所有相關的主交易（若有 splitGroupId 則獲取整個群組的所有主交易；否則只有單筆主交易）
  const relatedRootTransactions = useMemo(() => {
    if (!initialRootTx || !transactions) return [];

    if (initialRootTx.splitGroupId) {
      const list = transactions.filter(
        (t) => !t.deleted && !t.parentId && t.splitGroupId === initialRootTx.splitGroupId
      );
      return sortTransactionsDesc(list);
    }

    return [initialRootTx];
  }, [initialRootTx, transactions]);

  // 4. 二維列結構化構建：每一列包含一個主交易及其名下的所有子退款
  const CARD_WIDTH = 320;
  const REFUND_GAP = 24;
  const COLUMN_GAP = 32;
  const CONNECTOR_HEIGHT = 56;

  const columnsData = useMemo(() => {
    if (!transactions || relatedRootTransactions.length === 0) return [];

    // 先獲取每一列的交易數據及退款列表
    const rawCols = relatedRootTransactions.map((rootTx) => {
      const refunds = sortTransactionsDesc(
        transactions.filter((t) => !t.deleted && t.parentId === rootTx.id)
      );
      const refundCount = refunds.length;
      const refundGroupWidth =
        refundCount <= 1
          ? (refundCount === 1 ? CARD_WIDTH : 0)
          : refundCount * CARD_WIDTH + (refundCount - 1) * REFUND_GAP;

      return {
        rootTx,
        refunds,
        refundCount,
        refundGroupWidth,
      };
    });

    // 依序計算每棵樹的中心軸 centerX 與各卡片絕對 X 座標
    const result = [];
    let prevCenterX = 0;
    let prevRefundGroupWidth = 0;
    let prevHasRefunds = false;

    for (let i = 0; i < rawCols.length; i++) {
      const col = rawCols[i];
      let centerX: number;

      if (i === 0) {
        // 第 0 列的中心軸：確保退款卡片或主卡片左緣不小於 0
        const minLeftSpan = Math.max(CARD_WIDTH / 2, col.refundGroupWidth / 2);
        centerX = minLeftSpan;
      } else {
        // 條件 1：頂部主卡片行保持標準緊湊間距（間距 32px，卡片中心間距 352px）
        let minCenterX = prevCenterX + CARD_WIDTH + COLUMN_GAP;

        // 條件 2：若前一列與當前列皆有名下退款，必須確保底部退款行也不重疊
        if (prevHasRefunds && col.refundCount > 0) {
          const minRefundCenterX =
            prevCenterX + (prevRefundGroupWidth + col.refundGroupWidth) / 2 + COLUMN_GAP;
          minCenterX = Math.max(minCenterX, minRefundCenterX);
        }

        centerX = minCenterX;
      }

      // 主卡片左緣
      const rootLeft = centerX - CARD_WIDTH / 2;

      // 退款卡片中心與左緣
      const childCenters: number[] = [];
      const childLefts: number[] = [];
      for (let rIdx = 0; rIdx < col.refundCount; rIdx++) {
        const offset =
          col.refundCount <= 1
            ? 0
            : (rIdx - (col.refundCount - 1) / 2) * (CARD_WIDTH + REFUND_GAP);
        const cCenter = centerX + offset;
        childCenters.push(cCenter);
        childLefts.push(cCenter - CARD_WIDTH / 2);
      }

      result.push({
        rootTx: col.rootTx,
        refunds: col.refunds,
        centerX,
        rootLeft,
        childCenters,
        childLefts,
        refundCount: col.refundCount,
      });

      prevCenterX = centerX;
      prevRefundGroupWidth = col.refundGroupWidth;
      prevHasRefunds = col.refundCount > 0;
    }

    return result;
  }, [relatedRootTransactions, transactions]);

  // 5. 尺寸測量（舞台尺寸與卡片高度）
  const stageRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const childrenRef = useRef<HTMLDivElement>(null);

  const [stageSize, setStageSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [parentHeight, setParentHeight] = useState(520);
  const [childrenHeight, setChildrenHeight] = useState(440);

  // 控制相機平移過渡：初次打開時為 false（禁用過渡以防滑動/跳動），後續主動切換卡片時才啟用平滑過渡
  const [isTransitionReady, setIsTransitionReady] = useState(false);
  // 控制初次渲染可見性：在完成首幀真實高度測量前保持透明，測量完畢後柔和淡入，徹底杜絕高度突變引起的由下至上跳動
  const [isReadyToDisplay, setIsReadyToDisplay] = useState(false);

  useEffect(() => {
    setIsReadyToDisplay(false);
    setIsTransitionReady(false);
  }, [transactionId]);

  useEffect(() => {
    const updateMeasurements = () => {
      if (stageRef.current) {
        const clientW = stageRef.current.clientWidth;
        const clientH = stageRef.current.clientHeight;
        if (clientW > 0 && clientH > 0) {
          setStageSize({ width: clientW, height: clientH });
        }

        // 動態獲取同行主交易卡片的最大高度，確保同一行主卡片底緣齊平
        const pSlots = stageRef.current.querySelectorAll('.card-parent-slot');
        let maxP = 0;
        pSlots.forEach((el) => {
          const cardEl = (el as HTMLElement).firstElementChild as HTMLElement;
          const h = cardEl ? cardEl.offsetHeight : (el as HTMLElement).offsetHeight;
          if (h > maxP) maxP = h;
        });
        if (maxP > 0) setParentHeight(maxP);

        // 動態獲取同行退款卡片的最大高度，確保同一行退款卡片底緣齊平
        const cSlots = stageRef.current.querySelectorAll('.card-child-slot');
        let maxC = 0;
        cSlots.forEach((el) => {
          const cardEl = (el as HTMLElement).firstElementChild as HTMLElement;
          const h = cardEl ? cardEl.offsetHeight : (el as HTMLElement).offsetHeight;
          if (h > maxC) maxC = h;
        });
        if (maxC > 0) setChildrenHeight(maxC);

        // 首次測量就緒，可以純淡入呈現
        setIsReadyToDisplay(true);
      }
    };

    // 首幀立即測量，隨後雙重保險確認字型排版就緒
    const rafId = requestAnimationFrame(() => {
      updateMeasurements();
    });
    const timer = setTimeout(updateMeasurements, 40);
    const transitionTimer = setTimeout(() => {
      setIsTransitionReady(true);
    }, 150);

    window.addEventListener('resize', updateMeasurements);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      clearTimeout(transitionTimer);
      window.removeEventListener('resize', updateMeasurements);
    };
  }, [columnsData, activeTxId]);

  // 6. 計算當前選中卡片在二維舞台上的絕對座標 (x, y)
  const activeLocation = useMemo(() => {
    if (!activeTxId || columnsData.length === 0) {
      return { x: CARD_WIDTH / 2, y: parentHeight / 2, colIdx: 0, isChild: false, childIdx: -1 };
    }

    for (let cIdx = 0; cIdx < columnsData.length; cIdx++) {
      const col = columnsData[cIdx];
      // 6.1 選中的是主交易
      if (col.rootTx.id === activeTxId) {
        return {
          x: col.centerX,
          y: parentHeight / 2,
          colIdx: cIdx,
          isChild: false,
          childIdx: -1,
        };
      }

      // 6.2 選中的是該主交易名下的退款子交易
      const refIdx = col.refunds.findIndex((r) => r.id === activeTxId);
      if (refIdx >= 0) {
        return {
          x: col.childCenters[refIdx],
          y: parentHeight + CONNECTOR_HEIGHT + childrenHeight / 2,
          colIdx: cIdx,
          isChild: true,
          childIdx: refIdx,
        };
      }
    }

    // 預設第 0 列主交易
    return {
      x: columnsData[0]?.centerX || CARD_WIDTH / 2,
      y: parentHeight / 2,
      colIdx: 0,
      isChild: false,
      childIdx: -1,
    };
  }, [activeTxId, columnsData, parentHeight, childrenHeight]);

  // 畫布總寬度（計算最右側卡片的邊界）
  const totalCanvasWidth = useMemo(() => {
    if (columnsData.length === 0) return 800;
    let maxRight = 0;
    for (const col of columnsData) {
      const rootRight = col.rootLeft + CARD_WIDTH;
      if (rootRight > maxRight) maxRight = rootRight;
      for (const left of col.childLefts) {
        const childRight = left + CARD_WIDTH;
        if (childRight > maxRight) maxRight = childRight;
      }
    }
    return maxRight;
  }, [columnsData]);

  // 7. 相機平移量：將當前選中卡片的 (x, y) 搬移到舞台中央 (stageWidth / 2, stageHeight / 2)
  const currentTranslateX = stageSize.width / 2 - activeLocation.x;
  const currentTranslateY = stageSize.height / 2 - activeLocation.y;

  // 當前聚焦列
  const currentColumn = useMemo(() => {
    if (columnsData.length === 0) return null;
    return columnsData[activeLocation.colIdx] || columnsData[0];
  }, [columnsData, activeLocation.colIdx]);

  // 當前列的主交易
  const activeRootTx = currentColumn?.rootTx || null;

  // 當前列的所有退款
  const activeColumnRefunds = useMemo(() => {
    return currentColumn?.refunds || [];
  }, [currentColumn]);

  // 已退款總額
  const refundedTotal = useMemo(() => {
    return activeColumnRefunds.reduce((sum, r) => sum + (r.originalAmount ?? r.amount), 0);
  }, [activeColumnRefunds]);

  // 主交易原始金額
  const rootOriginalAmount = useMemo(() => {
    if (!activeRootTx) return 0;
    return activeRootTx.originalAmount ?? activeRootTx.amount;
  }, [activeRootTx]);

  // 剩餘可退金額上限
  const maxRefundable = useMemo(() => {
    return Math.max(0, Math.round((rootOriginalAmount - refundedTotal) * 100) / 100);
  }, [rootOriginalAmount, refundedTotal]);

  // 當前選中的交易是否為退款子交易
  const isCurrentActiveRefund = activeLocation.isChild;

  // 當前選中的交易是否為餘額調整交易
  const isAdjustmentRoot = useMemo(() => {
    return isBalanceAdjustmentTx(activeRootTx, allCategories);
  }, [activeRootTx, allCategories]);

  const isCurrentAdjustment = useMemo(() => {
    return isBalanceAdjustmentTx(currentTransaction, allCategories);
  }, [currentTransaction, allCategories]);

  // 當前選中的交易是否為不可退款類型（轉帳、借貸或餘額調整不可退）
  const isNonRefundableType = useMemo(() => {
    if (!activeRootTx) return true;
    if (isAdjustmentRoot) return true;
    return activeRootTx.type !== 'expense' && activeRootTx.type !== 'income';
  }, [activeRootTx, isAdjustmentRoot]);

  // 當前交易是否不允許編輯（餘額調整交易或退款憑證不可編輯）
  const isEditDisabled = isCurrentAdjustment || isCurrentActiveRefund;

  // 退款彈窗開關
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);

  // 8. 二維巡航邏輯 (Navigate Left / Right / Up / Down)
  const navigateLeft = useCallback(() => {
    if (columnsData.length === 0) return;
    const { colIdx, isChild, childIdx } = activeLocation;
    const col = columnsData[colIdx];

    if (isChild) {
      if (childIdx > 0) {
        setActiveTxId(col.refunds[childIdx - 1].id);
        return;
      }
      if (colIdx > 0) {
        const prevCol = columnsData[colIdx - 1];
        if (prevCol.refunds.length > 0) {
          setActiveTxId(prevCol.refunds[prevCol.refunds.length - 1].id);
        } else {
          setActiveTxId(prevCol.rootTx.id);
        }
      }
    } else {
      if (colIdx > 0) {
        setActiveTxId(columnsData[colIdx - 1].rootTx.id);
      }
    }
  }, [columnsData, activeLocation]);

  const navigateRight = useCallback(() => {
    if (columnsData.length === 0) return;
    const { colIdx, isChild, childIdx } = activeLocation;
    const col = columnsData[colIdx];

    if (isChild) {
      if (childIdx < col.refunds.length - 1) {
        setActiveTxId(col.refunds[childIdx + 1].id);
        return;
      }
      if (colIdx < columnsData.length - 1) {
        const nextCol = columnsData[colIdx + 1];
        if (nextCol.refunds.length > 0) {
          setActiveTxId(nextCol.refunds[0].id);
        } else {
          setActiveTxId(nextCol.rootTx.id);
        }
      }
    } else {
      if (colIdx < columnsData.length - 1) {
        setActiveTxId(columnsData[colIdx + 1].rootTx.id);
      }
    }
  }, [columnsData, activeLocation]);

  const navigateDown = useCallback(() => {
    if (columnsData.length === 0) return;
    const { colIdx, isChild } = activeLocation;
    const col = columnsData[colIdx];

    if (!isChild && col.refunds.length > 0) {
      setActiveTxId(col.refunds[0].id);
    }
  }, [columnsData, activeLocation]);

  const navigateUp = useCallback(() => {
    if (columnsData.length === 0) return;
    const { colIdx, isChild } = activeLocation;
    const col = columnsData[colIdx];

    if (isChild) {
      setActiveTxId(col.rootTx.id);
    }
  }, [columnsData, activeLocation]);

  // 鍵盤導航
  useEffect(() => {
    if (!transactionId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateDown();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateLeft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateRight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transactionId, navigateUp, navigateDown, navigateLeft, navigateRight]);

  // 觸控手勢
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(diffY) >= Math.abs(diffX) && Math.abs(diffY) > 35) {
      if (diffY < -35) {
        navigateDown();
      } else if (diffY > 35) {
        navigateUp();
      }
    } else if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
      if (diffX < -35) {
        navigateRight();
      } else if (diffX > 35) {
        navigateLeft();
      }
    }
  };

  // 滑鼠滾輪（支援 Shift 水平滑動與原生水平/垂直滾動）
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    // 判斷是否為水平滾動（按住 Shift 鍵，或原生水平滾動 deltaX 大於 deltaY）
    const isHorizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal) {
      // 若按住 Shift 鍵，不同瀏覽器/平臺可能由 deltaX 或 deltaY 攜帶滾動幅度
      const effectiveDelta = Math.abs(e.deltaX) >= 20 ? e.deltaX : e.deltaY;
      if (Math.abs(effectiveDelta) < 20) return;

      if (wheelTimeoutRef.current) return;
      wheelTimeoutRef.current = setTimeout(() => {
        wheelTimeoutRef.current = null;
      }, 350);

      if (effectiveDelta > 0) {
        navigateRight();
      } else if (effectiveDelta < 0) {
        navigateLeft();
      }
    } else {
      // 常規垂直滾動：在主卡片與名下退款子卡片之間上下切換
      if (Math.abs(e.deltaY) < 20) return;

      if (wheelTimeoutRef.current) return;
      wheelTimeoutRef.current = setTimeout(() => {
        wheelTimeoutRef.current = null;
      }, 350);

      if (e.deltaY > 0) {
        navigateDown();
      } else if (e.deltaY < 0) {
        navigateUp();
      }
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
      if (cat.name.includes('退款') || cat.name.toLowerCase().includes('refund')) {
        return t('refund.title', '退款');
      }
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

    const isChild = !!currentTransaction.parentId;
    const description = isChild
      ? t('refund.deleteRefundConfirm', '確定要刪除這筆退款記錄嗎？此操作無法復原。')
      : activeColumnRefunds.length > 0
      ? t('refund.deleteParentWithChildrenConfirm', '確定要刪除這筆主交易及其關聯的退款記錄嗎？此操作無法復原。')
      : t('dashboard.deleteTransactionConfirm');

    const confirmed = await confirm({
      title: isChild ? t('refund.deleteRefundTitle', '刪除退款') : t('dashboard.deleteTransaction'),
      description,
      confirmText: t('common.delete'),
      variant: 'destructive',
    });

    if (!confirmed) return;

    if (isChild) {
      await deleteTransaction(activeTxId);
      if (activeRootTx) {
        setActiveTxId(activeRootTx.id);
      } else {
        onClose();
      }
    } else {
      if (activeColumnRefunds.length > 0) {
        for (const child of activeColumnRefunds) {
          await deleteTransaction(child.id);
        }
      }
      await deleteTransaction(activeTxId);
      const remainingCols = columnsData.filter((c) => c.rootTx.id !== activeTxId);
      if (remainingCols.length > 0) {
        setActiveTxId(remainingCols[0].rootTx.id);
      } else {
        onClose();
      }
    }
  };

  const handleRefund = () => {
    if (!activeRootTx || isCurrentActiveRefund || isNonRefundableType || maxRefundable <= 0) return;
    setIsRefundDialogOpen(true);
  };

  /**
   * Render an authentic paper receipt card
   */
  const renderCard = (tx: Transaction, idx: number) => {
    const isActive = tx.id === activeTxId;
    const isChild = !!tx.parentId;
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
      relatedRootTransactions.some((t) => t.type === 'transfer');
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

    const effectiveType = isChild ? tx.type : cardType;
    const amountColorClass = (() => {
      if (effectiveType === 'income') return 'text-emerald-500 dark:text-emerald-400';
      if (effectiveType === 'expense') return 'text-rose-500 dark:text-rose-400';
      if (effectiveType === 'transfer') return 'text-blue-500 dark:text-blue-400';
      return 'text-foreground';
    })();

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
          "w-[320px] shrink-0 bg-card text-card-foreground rounded-2xl shadow-none relative overflow-hidden transition-all duration-300 border border-border flex flex-col justify-between",
          isActive
            ? "opacity-100 pointer-events-auto select-text cursor-default"
            : "opacity-30 hover:opacity-60 cursor-pointer pointer-events-auto select-none"
        )}
      >
        {/* Top Paper Header: Branding & Serial */}
        <div className="pt-5 px-5 pb-2.5 flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isChild ? (
              <div className="w-4 h-4 rounded bg-emerald-500 text-black text-[10px] font-bold flex items-center justify-center font-mono">↩</div>
            ) : (
              <Logo size={18} showBorder={false} className="rounded shrink-0" />
            )}
            <span className={cn(
              "text-[11px] font-mono font-bold uppercase tracking-[0.25em]",
              isChild ? "text-emerald-500 dark:text-emerald-400" : "text-foreground"
            )}>
              {isChild ? "REFUND VOUCHER" : "ZENANCE"}
            </span>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block mb-2.5">
            {isChild ? t('refund.subRefundItem', '退款憑證') : t('receipt.voucherTitle', 'TRANSACTION RECEIPT')}
          </span>

          {/* Serial & Date Bar (shows group index if multiple cards) */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-3 border-b border-border/70 pb-2">
            <div className="flex items-center gap-1 font-semibold text-foreground">
              <span>#{displayRef}</span>
              {!isChild && columnsData.length > 1 && (
                <span className="text-[10px] text-muted-foreground/60 font-normal">
                  ({idx + 1}/{columnsData.length})
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
            {isChild ? (
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border leading-none shrink-0",
                tx.type === 'expense'
                  ? "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20"
                  : "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20"
              )}>
                {tx.type === 'income' ? t('refund.title', '支出退款') : t('refund.title', '收入退款')}
              </span>
            ) : tx.type === 'transfer' ? (
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

          {/* Hero Amount Monospace Display with AutoMarquee */}
          <div className="w-full max-w-full overflow-hidden text-3xl sm:text-4xl font-mono tracking-tighter font-extrabold select-all py-1.5 leading-tight flex items-center justify-center">
            <AutoMarquee align="center" active={isActive} className="max-w-full">
              <AmountDisplay
                amount={cardAmount}
                originalCurrency={isDirectOriginal ? undefined : tx.originalCurrency}
                baseCurrency={cardBaseCurrency}
                isApproximate={isDirectOriginal ? false : undefined}
                type={effectiveType as any}
                className={amountColorClass}
                showSign={false}
              />
            </AutoMarquee>
          </div>

          {/* 若為主交易且存在已退款金額，顯示已退款提示 */}
          {!isChild && (() => {
            const cardRefunds = transactions?.filter((t) => !t.deleted && t.parentId === tx.id) || [];
            const cardRefundedTotal = cardRefunds.reduce((sum, r) => sum + (r.originalAmount ?? r.amount), 0);
            if (cardRefundedTotal <= 0) return null;
            return (
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>{getAccountName(tx.accountId)}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                  {t('refund.refunded', '已退款')} {formatAmountNumber(cardRefundedTotal)}
                </span>
              </div>
            );
          })()}
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
    <>
      <Dialog open={!!transactionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        fullscreen={true}
        className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !sm:max-w-none !p-0 !bg-transparent !border-none !shadow-none !outline-none !flex !flex-col !items-center !justify-center !overflow-hidden !pointer-events-none select-none duration-200"
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
        {/* Main Content Area                                         */}
        {/* ========================================================= */}
        <div
          className={cn(
            "relative z-10 w-full h-full pointer-events-none transition-opacity duration-150 ease-out",
            isReadyToDisplay ? "opacity-100" : "opacity-0"
          )}
        >
          
          {/* Scrollable / Centered 2D Stage (佔滿全螢幕高度，杜絕上下邊界裁切) */}
          <div
            ref={stageRef}
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto select-none"
            onWheel={handleWheel}
            onClick={onClose}
          >
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className={cn(
                "absolute left-0 top-0 cursor-default will-change-transform",
                isTransitionReady
                  ? "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  : "transition-none"
              )}
              style={{
                transform: `translate3d(${currentTranslateX}px, ${currentTranslateY}px, 0)`,
                width: `${totalCanvasWidth}px`,
                height: `${parentHeight + CONNECTOR_HEIGHT + childrenHeight}px`,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
              }}
            >
              {/* 1. 中間樹狀分支連接線 */}
              {columnsData.map((col) => {
                if (col.refunds.length === 0) return null;
                return (
                  <div
                    key={`conn-${col.rootTx.id}`}
                    style={{
                      position: 'absolute',
                      left: `${col.centerX}px`,
                      top: `${parentHeight}px`,
                      transform: 'translateX(-50%)',
                      height: `${CONNECTOR_HEIGHT}px`,
                    }}
                    className="pointer-events-none"
                  >
                    <TreeBranchConnector
                      count={col.refunds.length}
                      cardWidth={CARD_WIDTH}
                      gap={REFUND_GAP}
                      height={CONNECTOR_HEIGHT}
                    />
                  </div>
                );
              })}

              {/* 2. 頂部主交易卡片行（同行底部對齊） */}
              {columnsData.map((col, cIdx) => (
                <div
                  key={col.rootTx.id}
                  ref={cIdx === 0 ? parentRef : undefined}
                  style={{
                    position: 'absolute',
                    left: `${col.rootLeft}px`,
                    top: 0,
                    width: `${CARD_WIDTH}px`,
                    height: `${parentHeight}px`,
                  }}
                  className="card-parent-slot flex items-end justify-center shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTxId(col.rootTx.id);
                  }}
                >
                  {renderCard(col.rootTx, cIdx)}
                </div>
              ))}

              {/* 3. 下方退款子卡片（同行底部對齊） */}
              {columnsData.map((col, cIdx) =>
                col.refunds.map((refTx, rIdx) => (
                  <div
                    key={refTx.id}
                    ref={cIdx === 0 && rIdx === 0 ? childrenRef : undefined}
                    style={{
                      position: 'absolute',
                      left: `${col.childLefts[rIdx]}px`,
                      top: `${parentHeight + CONNECTOR_HEIGHT}px`,
                      width: `${CARD_WIDTH}px`,
                      height: `${childrenHeight}px`,
                    }}
                    className="card-child-slot flex items-end justify-center shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTxId(refTx.id);
                    }}
                  >
                    {renderCard(refTx, rIdx + 1)}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. 懸浮 4 欄 Dock Bar（固定在底部中央，毛玻璃懸浮，不侵佔舞台高度） */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[280px] select-none font-mono pointer-events-auto shrink-0 animate-in fade-in-0 duration-200 ease-out fill-mode-forwards"
          >
            <div className="grid grid-cols-4 divide-x divide-border/40 border border-border/50 rounded-full bg-background/40 dark:bg-zinc-900/40 backdrop-blur-xl overflow-hidden text-xs">
              {/* 1. 刪除 */}
              <button
                type="button"
                onClick={handleDelete}
                className="h-8.5 flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 active:bg-destructive/15 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
              >
                <span>{t('dashboard.delete')}</span>
              </button>

              {/* 2. 退款 */}
              <button
                type="button"
                disabled={isCurrentActiveRefund || isNonRefundableType || maxRefundable <= 0}
                onClick={handleRefund}
                className={cn(
                  "h-8.5 flex items-center justify-center transition-all outline-none text-[11px] tracking-wide",
                  isCurrentActiveRefund || isNonRefundableType || maxRefundable <= 0
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 cursor-pointer"
                )}
              >
                <span>{t('dashboard.refund', '退款')}</span>
              </button>

              {/* 3. 編輯 */}
              <button
                type="button"
                disabled={isEditDisabled}
                onClick={() => {
                  if (isEditDisabled) return;
                  setEditingTransactionId(currentTransaction.id);
                  onClose();
                }}
                className={cn(
                  "h-8.5 flex items-center justify-center transition-all outline-none text-[11px] tracking-wide",
                  isEditDisabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 cursor-pointer"
                )}
              >
                <span>{t('dashboard.edit', '編輯')}</span>
              </button>

              {/* 4. 關閉 */}
              <button
                type="button"
                onClick={onClose}
                className="h-8.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:bg-muted/60 transition-all cursor-pointer outline-none text-[11px] tracking-wide"
              >
                <span>{t('dashboard.close')}</span>
              </button>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>

    {/* 退款 Dialog（解耦為頂層兄弟節點，確保 Base UI Backdrop 正常渲染遮罩） */}
    <RefundDialog
      open={isRefundDialogOpen}
      onOpenChange={setIsRefundDialogOpen}
      transaction={activeRootTx || currentTransaction}
      maxRefundable={maxRefundable}
    />
  </>
  );
}
