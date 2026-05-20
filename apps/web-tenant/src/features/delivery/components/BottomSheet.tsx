import React, { useCallback, useEffect, useRef, useState } from 'react';

type BottomSheetState = 'collapsed' | 'peeking' | 'expanded';

interface BottomSheetProps {
  children: React.ReactNode;
  defaultState?: BottomSheetState;
  minHeight?: number;
  peekHeight?: number;
  maxHeight?: number;
  onStateChange?: (state: BottomSheetState) => void;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  defaultState = 'peeking',
  minHeight = 80,
  peekHeight = 200,
  maxHeight = 500,
  onStateChange,
}) => {
  const [state, setState] = useState<BottomSheetState>(defaultState);
  const [currentHeight, setCurrentHeight] = useState(minHeight);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let targetHeight = minHeight;
    if (state === 'peeking') targetHeight = peekHeight;
    if (state === 'expanded') targetHeight = maxHeight;
    setCurrentHeight(targetHeight);
    onStateChange?.(state);
  }, [state, minHeight, peekHeight, maxHeight, onStateChange]);

  const getStateFromHeight = (height: number): BottomSheetState => {
    const midPeekExpanded = (peekHeight + maxHeight) / 2;
    const midCollapsedPeek = (minHeight + peekHeight) / 2;
    if (height > midPeekExpanded) return 'expanded';
    if (height > midCollapsedPeek) return 'peeking';
    return 'collapsed';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setStartHeight(currentHeight);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const deltaY = startY - e.touches[0].clientY;
    let newHeight = startHeight + deltaY;
    if (newHeight < minHeight) newHeight = minHeight;
    if (newHeight > maxHeight) newHeight = maxHeight;
    setCurrentHeight(newHeight);
  }, [startY, startHeight, minHeight, maxHeight]);

  const handleTouchEnd = useCallback(() => {
    const newState = getStateFromHeight(currentHeight);
    setState(newState);
  }, [currentHeight, getStateFromHeight]);

  useEffect(() => {
    if (sheetRef.current) {
      const el = sheetRef.current;
      el.addEventListener('touchmove', handleTouchMove, { passive: true });
      el.addEventListener('touchend', handleTouchEnd);
      return () => {
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={sheetRef}
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-40 flex flex-col"
      style={{
        height: currentHeight,
        transition: 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      <div
        className="cursor-grab active:cursor-grabbing p-4 flex flex-col items-center gap-2 border-b border-gray-100 dark:border-gray-800"
        onTouchStart={handleTouchStart}
        onClick={() => {
          setState((prev) => prev === 'collapsed' ? 'peeking' : prev === 'peeking' ? 'expanded' : 'collapsed');
        }}
      >
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          {state === 'collapsed' ? 'Arraste para abrir' : state === 'peeking' ? 'Arraste para expandir' : 'Arraste para recolher'}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
