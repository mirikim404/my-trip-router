import { useLayoutEffect, useRef, useState } from 'react';

// 한 시간대(row) 안에서 A안/B안을 좌우 드래그로 전환하는 미니 캐러셀.
// - 점/스크롤바 같은 인디케이터는 두지 않는다.
// - 드래그 중에는 transition 없이 손가락(포인터) 위치를 1:1로 그대로 따라간다.
// - 손을 뗐을 때, 이동 거리가 이 행 너비의 30%를 넘으면 옆 옵션으로 스냅하고
//   30%를 넘지 못하면 원래 옵션 자리로 다시 스냅한다.
// - 다른 행에는 전혀 영향을 주지 않는, 행 단위로 완전히 독립된 슬라이드다.
const SNAP_THRESHOLD_RATIO = 0.3;
const DIRECTION_LOCK_PX = 8; // 이 값 전까지는 아직 "가로 드래그"로 확정하지 않는다.
const EDGE_RESISTANCE = 0.35; // 맨 앞/맨 뒤 옵션에서 더 당길 때 주는 고무줄 저항

// 배지+제목이 A/B(/C...)로 좌우 스와이프되는 부분만 떼어낸 조각.
// Sidebar.jsx의 기존 목록 항목처럼, "시간" 없이 다른 레이아웃에 끼워 넣어야
// 하는 곳에서도 그대로 재사용할 수 있도록 별도로 export한다.
// 옵션이 1개뿐이면(아직 합쳐지지 않은 일반 장소) 스와이프할 대상이 없으므로
// 제스처 리스너 자체를 붙이지 않고 정적으로만 보여준다.
export function OptionSwiper({ options, selectedIndex, onSelect }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const optionCount = options.length;

  // 현재 제스처 진행 상태를 담는 값 (렌더와 무관하게 즉시 업데이트되어야 하므로 ref로 관리)
  const gesture = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    axis: null, // 'x' | 'y' | null(아직 미확정)
    width: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const restOffsetPx = (index, width) => -(index * width);

  const applyTransform = (px, withTransition) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = withTransition
      ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none';
    track.style.transform = `translateX(${px}px)`;
  };

  // 옵션이 바뀌거나(다른 곳에서 선택이 바뀌거나) 리사이즈될 때 제자리로 맞춰준다.
  useLayoutEffect(() => {
    const width = viewportRef.current?.getBoundingClientRect().width || 0;
    gesture.current.width = width;
    applyTransform(restOffsetPx(selectedIndex, width), false);
  }, [selectedIndex, optionCount]);

  const handlePointerDown = (event) => {
    const width = viewportRef.current?.getBoundingClientRect().width || 0;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      width,
    };
  };

  const handlePointerMove = (event) => {
    const state = gesture.current;
    if (state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.axis === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      // 세로 움직임이 더 크면 스크롤 의도로 보고 이 행은 잠근다(가로 드래그 취소).
      state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (state.axis === 'x') {
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
      }
    }

    if (state.axis !== 'x') return;

    event.preventDefault();

    let delta = dx;
    const atStart = selectedIndex === 0 && delta > 0;
    const atEnd = selectedIndex === optionCount - 1 && delta < 0;
    if (atStart || atEnd) delta *= EDGE_RESISTANCE;

    applyTransform(restOffsetPx(selectedIndex, state.width) + delta, false);
  };

  const finishDrag = (event) => {
    const state = gesture.current;
    if (state.pointerId !== event.pointerId) return;

    const wasDraggingX = state.axis === 'x';
    const dx = event.clientX - state.startX;
    gesture.current = { pointerId: null, startX: 0, startY: 0, axis: null, width: state.width };
    setIsDragging(false);

    if (!wasDraggingX) return;

    const passedThreshold = Math.abs(dx) > state.width * SNAP_THRESHOLD_RATIO;
    let nextIndex = selectedIndex;
    if (passedThreshold) {
      nextIndex = dx < 0
        ? Math.min(selectedIndex + 1, optionCount - 1)
        : Math.max(selectedIndex - 1, 0);
    }

    applyTransform(restOffsetPx(nextIndex, state.width), true);
    if (nextIndex !== selectedIndex) onSelect(nextIndex);
  };

  // 옵션이 하나뿐이면 아직 아무것도 합쳐지지 않은 일반 항목 — 그냥 고정 표시.
  if (optionCount <= 1) {
    const only = options[0];
    return (
      <div className="option-swiper is-static">
        <span className="schedule-row-title" title={only?.title}>
          {only?.title}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`option-swiper-viewport${isDragging ? ' is-dragging' : ''}`}
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        className="option-swiper-track"
        ref={trackRef}
        style={{ width: `${optionCount * 100}%` }}
      >
        {options.map((option, index) => (
          <div
            className="option-swiper-option"
            key={option.id}
            style={{ width: `${100 / optionCount}%` }}
          >
            <span className={`schedule-badge schedule-badge-${index % 2 === 0 ? 'a' : 'b'}`}>
              {String.fromCharCode(65 + index)}
            </span>
            <span className="schedule-row-title" title={option.title}>
              {option.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// DayScheduleCard 전용: 왼쪽에 시간을 고정으로 붙인 한 행.
function ScheduleRow({ time, options, selectedIndex, onSelect }) {
  return (
    <div className="schedule-row">
      <span className="schedule-row-time">{time}</span>
      <OptionSwiper options={options} selectedIndex={selectedIndex} onSelect={onSelect} />
    </div>
  );
}

const RouteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 19c3-1 3-4 0-5s-3-4 0-5 8-1 8-1M19 5c-3 1-3 4 0 5s3 4 0 5-8 1-8 1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// items: [{ id, time, options: [{ id, title }, { id, title }], selectedIndex }]
// selectedIndex는 각 항목의 "현재 A/B 중 무엇이 선택돼 있는지"를 부모(App)가
// 들고 있게 하기 위한 값이다 — 여기서는 넘겨받은 값을 그대로 보여주기만 하고,
// 스냅이 끝나면 onOptionChange(itemId, nextIndex)로 알려서 부모 state를 갱신한다.
function DayScheduleCard({
  dayLabel,
  items,
  onOptionChange,
  routeActive = false,
  routeLoading = false,
  onToggleRoute,
}) {
  return (
    <div className="schedule-card">
      <div className="schedule-card-header">
        <h3>{dayLabel}</h3>
      </div>

      <div className="schedule-card-body">
        {items.map((item) => (
          <ScheduleRow
            key={item.id}
            time={item.time}
            options={item.options}
            selectedIndex={item.selectedIndex ?? 0}
            onSelect={(nextIndex) => onOptionChange?.(item.id, nextIndex)}
          />
        ))}
      </div>

      <p className="schedule-card-hint">항목을 좌우로 밀면 다른 옵션이 나와요</p>

      <button
        type="button"
        className={`schedule-route-toggle${routeActive ? ' is-active' : ''}`}
        onClick={onToggleRoute}
        disabled={routeLoading}
        aria-pressed={routeActive}
      >
        <RouteIcon />
        <span>{routeLoading ? '경로 계산 중...' : routeActive ? '경로 숨기기' : '경로 보기'}</span>
      </button>
    </div>
  );
}

export default DayScheduleCard;
