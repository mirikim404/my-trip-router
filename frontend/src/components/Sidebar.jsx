import { useLayoutEffect, useRef, useState } from 'react';
import Search from './Search';
import { OptionSwiper } from './DayScheduleCard';
import { useBottomSheet } from '../utils/useBottomSheet';

// 드롭 위치가 항목 세로 영역의 위/아래 25% 안쪽이면 "순서 변경", 가운데
// 50%면 "이 항목의 대안(B안/C안...)으로 합치기"로 구분한다.
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
  onOptimize,
  onResetTrip,
  onSharePlan,
  shareStatus,
}) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { index, mode: 'before' | 'after' | 'merge' }
  const [selectedPlaces, setSelectedPlaces] = useState({});
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

  // itinerary[day]의 각 항목은 이제 "슬롯"이다: { id, options: [place, ...], selectedIndex }.
  // 슬롯 자체의 id를 키로 쓰고, 실제 경로 계산에는 슬롯이 현재 보여주고 있는
  // 옵션(선택된 A안/B안 하나)만 골라 넘긴다.
  const getSlotKey = (slot) => slot.id;
  const getActivePlace = (slot) => slot.options[slot.selectedIndex ?? 0];

  const getSelectedPlaces = (day) => {
    const selectedKeys = selectedPlaces[day];
    return (itinerary[day] || [])
      .filter((slot) => !selectedKeys || selectedKeys.includes(getSlotKey(slot)))
      .map((slot) => getActivePlace(slot));
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
                  const selectedKeys = selectedPlaces[day.key];
                  const isSelected = !selectedKeys || selectedKeys.includes(slotKey);
                  const isMultiOption = slot.options.length > 1;
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
                          // 드래그 중 미리보기 이미지는 행 전체(li)로 보이게 하되,
                          // 실제 draggable/포인터 캡처는 이 손잡이에만 걸어서
                          // OptionSwiper의 좌우 스와이프와 겹치지 않게 한다.
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

                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const currentKeys = selectedKeys || places.map((item) => getSlotKey(item));
                          setSelectedPlaces((previous) => ({
                            ...previous,
                            [day.key]: isSelected
                              ? currentKeys.filter((key) => key !== slotKey)
                              : [...currentKeys, slotKey],
                          }));
                        }}
                        aria-label={`${activePlace.title} 경로에 포함`}
                      />

                      <div className="place-options">
                        <span className="place-index">{index + 1}.</span>
                        <OptionSwiper
                          options={slot.options}
                          selectedIndex={slot.selectedIndex ?? 0}
                          onSelect={(nextIndex) => onSelectOption(day.key, slotKey, nextIndex)}
                        />
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

            <button className="optimize-button" onClick={() => onOptimize(day.key, getSelectedPlaces(day.key))}>
              선택한 장소로 경로 만들기
            </button>
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

            {/* key: 오버레이를 열 때마다(=activeDayKey가 바뀌었을 수도 있는
                시점) 컴포넌트를 새로 마운트해서 그 순간의 activeDayKey를
                기본 선택값으로 반영한다. */}
            <Search key={activeDayKey} days={days} initialDay={activeDayKey} onAddPlace={onAddPlace} />
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
