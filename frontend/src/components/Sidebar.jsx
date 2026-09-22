import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Search from './Search';

// Bottom-sheet snap points, as a fraction of the viewport height (mobile only —
// on desktop the sidebar ignores these and stays at its fixed 100vh height).
const SHEET_PEEK = 0.16;
const SHEET_HALF = 0.5;
const SHEET_FULL = 0.92;
const SHEET_MIN_PX = 120;
const SHEET_TAP_THRESHOLD_PX = 6;

const Sidebar = ({
  profile,
  days,
  itinerary,
  onAddPlace,
  onDeletePlace,
  onReorder,
  onOptimize,
  onResetTrip,
  onSharePlan,
  shareStatus,
}) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedPlaces, setSelectedPlaces] = useState({});
  const itemRefs = useRef(new Map());
  const previousPositions = useRef(new Map());

  const [sheetHeight, setSheetHeight] = useState(() => (
    Math.round(window.innerHeight * SHEET_HALF)
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

  const getPlaceKey = (day, place) => (
    place.id || `${day}-${place.title}-${place.address || ''}-${place.lat}-${place.lng}`
  );

  const getSelectedPlaces = (day) => {
    const selectedKeys = selectedPlaces[day];
    return (itinerary[day] || []).filter((place) => (
      !selectedKeys || selectedKeys.includes(getPlaceKey(day, place))
    ));
  };

  useLayoutEffect(() => {
    const nextPositions = new Map();

    itemRefs.current.forEach((element, key) => {
      if (!element) return;

      const nextPosition = element.getBoundingClientRect();
      const previousPosition = previousPositions.current.get(key);

      if (previousPosition) {
        const offsetY = previousPosition.top - nextPosition.top;
        if (offsetY) {
          element.animate(
            [
              { transform: `translateY(${offsetY}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 240, easing: 'ease-out' },
          );
        }
      }

      nextPositions.set(key, nextPosition);
    });

    previousPositions.current = nextPositions;
  }, [itinerary]);

  return (
    <aside
      className={`sidebar${isSheetDragging ? ' dragging' : ''}`}
      style={{ '--sheet-height': `${sheetHeight}px` }}
    >
      <div
        className="sheet-handle"
        role="button"
        tabIndex={0}
        aria-label="목록 크기 조절 (드래그하거나 탭하세요)"
        onPointerDown={handleSheetPointerDown}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={handleSheetPointerUp}
        onPointerCancel={handleSheetPointerUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            cycleSheetHeight();
          }
        }}
      />

      <div className="trip-summary">
        <div>
          <p>{profile.travelerName}의 여행</p>
          <h2>{days[0]?.displayDate} - {days[days.length - 1]?.displayDate}</h2>
        </div>
        <button onClick={onResetTrip}>날짜 변경</button>
      </div>

      <section className="share-panel" aria-label="공유하기">
        <button className="share-button" onClick={onSharePlan} disabled={shareStatus.isSaving}>
          {shareStatus.isSaving ? '링크 만드는 중...' : '공유 링크 만들기'}
        </button>

        {shareStatus.url && (
          <div className="share-result">
            <p>{shareStatus.copied ? '링크를 클립보드에 복사했어요.' : '아래 링크를 복사해서 보내주세요.'}</p>
            <input readOnly value={shareStatus.url} onFocus={(event) => event.target.select()} />
          </div>
        )}
      </section>

      <Search days={days} onAddPlace={onAddPlace} />

      <div className="day-list">
        {days.map((day) => {
          const places = itinerary[day.key] || [];

          return (
            <section className="day-panel" key={day.key}>
              <header>
                <div>
                  <h3>{day.label}</h3>
                  <span>{day.displayDate}</span>
                </div>
                <span>{places.length}곳</span>
              </header>

              {places.length === 0 ? (
                <p className="empty-state">아직 추가한 장소가 없어요.</p>
              ) : (
                <ul className="place-list">
                  {places.map((place, index) => {
                    const placeKey = getPlaceKey(day.key, place);
                    const selectedKeys = selectedPlaces[day.key];
                    const isSelected = !selectedKeys || selectedKeys.includes(placeKey);

                    return (
                      <li
                        key={placeKey}
                        ref={(element) => itemRefs.current.set(placeKey, element)}
                        draggable
                        onDragStart={() => setDraggedItem({ day: day.key, index })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedItem && draggedItem.day === day.key) {
                            onReorder(day.key, draggedItem.index, index);
                          }
                          setDraggedItem(null);
                        }}
                        onDragEnd={() => setDraggedItem(null)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const currentKeys = selectedKeys || places.map((item) => getPlaceKey(day.key, item));
                            setSelectedPlaces((previous) => ({
                              ...previous,
                              [day.key]: isSelected
                                ? currentKeys.filter((key) => key !== placeKey)
                                : [...currentKeys, placeKey],
                            }));
                          }}
                          aria-label={`${place.title} 경로에 포함`}
                        />

                        <strong title={place.title}>{index + 1}. {place.title}</strong>

                        <div className="place-actions">
                          <button
                            onClick={() => onReorder(day.key, index, index - 1)}
                            disabled={index === 0}
                            aria-label="위로 이동"
                            title="위로 이동"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => onDeletePlace(day.key, index)}
                            aria-label={`${place.title} 삭제`}
                            title="삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button className="optimize-button" onClick={() => onOptimize(day.key, getSelectedPlaces(day.key))}>
                선택한 장소로 경로 만들기
              </button>
            </section>
          );
        })}
      </div>
    </aside>
  );
};

export default Sidebar;
