import { useRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';

interface UseEdgeSwipeBackOptions {
  onSwipeBack: () => void;
  isDisabled?: boolean;
}

export function useEdgeSwipeBack({ onSwipeBack, isDisabled = false }: UseEdgeSwipeBackOptions) {
  const edgeTouchStartXRef = useRef<number>(0);
  const edgeTouchStartYRef = useRef<number>(0);
  const isEdgeSwipeActiveRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDisabled) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 640) return;
    const touch = e.touches[0];
    if (!touch) return;

    // 限制在螢幕左側邊緣 44px 內起手（符合 Apple HIG 標準熱區）
    if (touch.clientX <= 44) {
      edgeTouchStartXRef.current = touch.clientX;
      edgeTouchStartYRef.current = touch.clientY;
      isEdgeSwipeActiveRef.current = true;
    } else {
      isEdgeSwipeActiveRef.current = false;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isEdgeSwipeActiveRef.current) return;
    isEdgeSwipeActiveRef.current = false;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - edgeTouchStartXRef.current;
    const deltaY = touch.clientY - edgeTouchStartYRef.current;

    // 向右滑動超過 60px，且水平位移顯著大於垂直位移（避免垂直滑動時誤觸）
    if (deltaX > 60 && deltaX > Math.abs(deltaY) * 1.5) {
      triggerHaptic('light');
      onSwipeBack();
    }
  };

  const handleTouchCancel = () => {
    isEdgeSwipeActiveRef.current = false;
  };

  return {
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel,
  };
}
