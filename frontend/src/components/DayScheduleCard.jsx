import { useLayoutEffect, useRef, useState } from 'react';

const SNAP_THRESHOLD_RATIO = 0.3;
const DIRECTION_LOCK_PX = 8;
const EDGE_RESISTANCE = 0.35;

export function OptionSwiper({ options, selectedIndex, onSelect }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const optionCount = options.length;

  const gesture = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    axis: null,
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

function ScheduleRow({ time, options, selectedIndex, onSelect }) {
  return (
    <div className="schedule-row">
      <span className="schedule-row-time">{time}</span>
      <OptionSwiper options={options} selectedIndex={selectedIndex} onSelect={onSelect} />
    </div>
  );
}

function DayScheduleCard({
  dayLabel,
  items,
  onOptionChange,
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
    </div>
  );
}

export default DayScheduleCard;