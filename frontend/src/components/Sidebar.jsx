import { useLayoutEffect, useRef, useState } from 'react';
import Search from './Search';
import { useBottomSheet } from '../utils/useBottomSheet';

const EDGE_ZONE_RATIO = 0.25;

const Sidebar = ({
  profile,
  days,
  itinerary,
  activeDay,
  onSelectDay,
  onAddPlace,
  onDeletePlace,
  onReorder,
  onMergeIntoSlot,
  onSelectOption,
  onResetTrip,
  onSharePlan,
  shareStatus,
}) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); 
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const itemRefs = useRef(new Map());
  const previousPositions = useRef(new Map());

  const activeDayKey = days.some((day) => day.key === activeDay) ? activeDay : days[0]?.key || '';

  const {
    sheetHeight,
    isSheetDragging,
    cycleSheetHeight,
    handleSheetPointerDown,
    handleSheetPointerMove,
    handleSheetPointerUp,
  } = useBottomSheet();

  const getSlotKey = (slot) => slot.id;
  const getActivePlace = (slot) => slot.options[slot.selectedIndex ?? 0] ?? slot;

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

      <nav className="day-tabs" aria-label="날짜 선택">
        {days.map((day) => (
          <button
            key={day.key}
            className={day.key === activeDayKey ? 'active' : ''}
            onClick={() => onSelectDay(day.key)}
          >
            <strong>{day.label}</strong>
            <span>{day.displayDate}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-tools-desktop">
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
      </div>

      {(() => {
        const day = days.find((item) => item.key === activeDayKey);
        if (!day) return null;
        const places = itinerary[day.key] || [];

        return (
          <section className="day-panel" key={day.key}>
            {places.length === 0 ? (
              <p className="empty-state">아직 추가한 장소가 없어요.</p>
            ) : (
              <ul className="place-list">
                {places.map((slot, index) => {
                  const slotKey = getSlotKey(slot);
                  const activePlace = getActivePlace(slot);
                  const isMultiOption = (slot.options.length ?? 0) > 1;
                  const dropClass = dropTarget?.index === index ? ` drop-${dropTarget.mode}` : '';

                  return (
                    <li
                      key={slotKey}
                      ref={(element) => itemRefs.current.set(slotKey, element)}
                      className={dropClass.trim()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        const relativeY = (event.clientY - rect.top) / rect.height;
                        let mode = 'merge';
                        if (relativeY < EDGE_ZONE_RATIO) mode = 'before';
                        else if (relativeY > 1 - EDGE_ZONE_RATIO) mode = 'after';
                        setDropTarget({ index, mode });
                      }}
                      onDragLeave={() => {
                        setDropTarget((previous) => (previous?.index === index ? null : previous));
                      }}
                      onDrop={() => {
                        if (draggedItem && draggedItem.day === day.key && draggedItem.index !== index) {
                          if (dropTarget?.mode === 'merge') {
                            onMergeIntoSlot(day.key, draggedItem.id, slotKey);
                          } else {
                            onReorder(day.key, draggedItem.index, index);
                          }
                        }
                        setDraggedItem(null);
                        setDropTarget(null);
                      }}
                    >
                      <span
                        className="place-drag-handle"
                        draggable
                        onDragStart={(event) => {
                          const row = event.currentTarget.closest('li');
                          if (row) event.dataTransfer.setDragImage(row, 16, 16);
                          setDraggedItem({ day: day.key, index, id: slotKey });
                        }}
                        onDragEnd={() => {
                          setDraggedItem(null);
                          setDropTarget(null);
                        }}
                        role="button"
                        tabIndex={-1}
                        aria-label="드래그해서 순서 변경 또는 다른 항목에 겹쳐서 대안으로 합치기"
                      >
                        ⠿
                      </span>

                      <div className="place-options">
                        <div className="place-title-row">
                          <span className="place-index">{index + 1}.</span>
                          {isMultiOption && (
                            <span className={`schedule-badge schedule-badge-${(slot.selectedIndex ?? 0) % 2 === 0 ? 'a' : 'b'}`}>
                              {String.fromCharCode(65 + (slot.selectedIndex ?? 0))}
                            </span>
                          )}
                          <span className="schedule-row-title" title={activePlace.title}>
                            {activePlace.title}
                          </span>
                        </div>
                        
                        {/* A안, B안이 있을 때만 클릭 가능한 점 표시 */}
                        {isMultiOption && (
                          <div className="place-pagination">
                            {slot.options.map((_, dotIdx) => (
                              <button
                                key={dotIdx}
                                type="button"
                                className={(slot.selectedIndex ?? 0) === dotIdx ? 'is-active' : ''}
                                onClick={() => onSelectOption(day.key, slotKey, dotIdx)}
                                aria-label={`${dotIdx + 1}번째 옵션`}
                              />
                            ))}
                          </div>
                        )}
                      </div>

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
                          aria-label={isMultiOption ? `${activePlace.title} 옵션 삭제` : `${activePlace.title} 삭제`}
                          title={isMultiOption ? '현재 보이는 옵션만 삭제' : '삭제'}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })()}

      <button
        type="button"
        className="tools-fab"
        onClick={() => setIsToolsOpen(true)}
        aria-label="장소 검색 및 공유 열기"
      >
        + 장소 추가 · 공유
      </button>

      {isToolsOpen && (
        <div className="tools-overlay" role="dialog" aria-label="장소 검색 및 공유">
          <div className="tools-sheet">
            <div className="tools-sheet-header">
              <h3>장소 추가 · 공유</h3>
              <button
                type="button"
                className="tools-close"
                onClick={() => setIsToolsOpen(false)}
                aria-label="닫기"
              >
                ✕
              </button>
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

            <Search key={activeDayKey} days={days} initialDay={activeDayKey} onAddPlace={onAddPlace} />
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;