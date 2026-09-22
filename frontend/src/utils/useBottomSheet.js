import { useEffect, useRef, useState } from 'react';

// Bottom-sheet snap points, as a fraction of the viewport height (mobile only —
// on desktop the caller ignores these and keeps a fixed layout instead).
const SHEET_PEEK = 0.16;
const SHEET_HALF = 0.5;
const SHEET_FULL = 0.92;
const SHEET_MIN_PX = 120;
const SHEET_TAP_THRESHOLD_PX = 6;

// 네이버 지도 앱처럼, 지도를 기본으로 보여주고 그 위에 얹히는 바텀시트를
// 드래그하거나 탭해서 peek(살짝 보임) → half(절반) → full(거의 전체) 세
// 단계로 오갈 수 있게 하는 훅. Sidebar(메인 화면)와 SharePlanPage(공유
// 화면) 양쪽에서 동일하게 쓴다.
export const useBottomSheet = ({ initialHeightRatio = SHEET_HALF } = {}) => {
  const [sheetHeight, setSheetHeight] = useState(() => (
    Math.round(window.innerHeight * initialHeightRatio)
  ));
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const sheetDrag = useRef({ active: false, startY: 0, startHeight: 0 });

  useEffect(() => {
    const handleResize = () => {
      setSheetHeight((current) => (
        Math.min(window.innerHeight * SHEET_FULL, Math.max(SHEET_MIN_PX, current))
      ));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sheetSnapHeights = () => {
    const vh = window.innerHeight;
    return [vh * SHEET_PEEK, vh * SHEET_HALF, vh * SHEET_FULL];
  };

  const cycleSheetHeight = () => {
    const snaps = sheetSnapHeights();
    const currentIndex = snaps.reduce((closestIndex, snap, index) => (
      Math.abs(snap - sheetHeight) < Math.abs(snaps[closestIndex] - sheetHeight) ? index : closestIndex
    ), 0);
    setSheetHeight(snaps[(currentIndex + 1) % snaps.length]);
  };

  const handleSheetPointerDown = (event) => {
    sheetDrag.current = { active: true, startY: event.clientY, startHeight: sheetHeight };
    setIsSheetDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSheetPointerMove = (event) => {
    if (!sheetDrag.current.active) return;
    const delta = sheetDrag.current.startY - event.clientY;
    const maxHeight = window.innerHeight * SHEET_FULL;
    const next = Math.min(maxHeight, Math.max(SHEET_MIN_PX, sheetDrag.current.startHeight + delta));
    setSheetHeight(next);
  };

  const handleSheetPointerUp = (event) => {
    if (!sheetDrag.current.active) return;
    const totalMove = Math.abs(sheetDrag.current.startY - event.clientY);
    sheetDrag.current.active = false;
    setIsSheetDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (totalMove < SHEET_TAP_THRESHOLD_PX) {
      cycleSheetHeight();
      return;
    }

    const snaps = sheetSnapHeights();
    const nearest = snaps.reduce((closest, snap) => (
      Math.abs(snap - sheetHeight) < Math.abs(closest - sheetHeight) ? snap : closest
    ));
    setSheetHeight(nearest);
  };

  return {
    sheetHeight,
    isSheetDragging,
    cycleSheetHeight,
    handleSheetPointerDown,
    handleSheetPointerMove,
    handleSheetPointerUp,
  };
};

export const BOTTOM_SHEET_PEEK_RATIO = SHEET_PEEK;
