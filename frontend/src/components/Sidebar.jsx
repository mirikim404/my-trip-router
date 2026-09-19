import { useLayoutEffect, useRef, useState } from 'react';
import Search from './Search';

const Sidebar = ({ itinerary, onAddPlace, onDeletePlace, onReorder, onOptimize }) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const itemRefs = useRef(new Map());
  const previousPositions = useRef(new Map());

  const getPlaceKey = (day, place) => (
    place.id || `${day}-${place.title}-${place.address || ''}-${place.lat}-${place.lng}`
  );

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
              { transform: 'translateY(0)' }
            ],
            { duration: 240, easing: 'ease-out' }
          );
        }
      }

      nextPositions.set(key, nextPosition);
    });

    previousPositions.current = nextPositions;
  }, [itinerary]);

  return (
    <div style={{
      width: '360px',
      height: '100vh',
      padding: '20px',
      borderRight: '1px solid #e0e0e0',
      overflowY: 'auto',
      backgroundColor: '#ffffff',
      boxSizing: 'border-box'
    }}>
      <h2 style={{ marginTop: 0, fontSize: '20px', color: '#111' }}>My Trip Router 🗺️</h2>
      
      <Search onAddPlace={onAddPlace} />

      {Object.keys(itinerary).map((day) => (
        <div key={day} style={{ marginBottom: '25px', padding: '15px', border: '1px solid #eee', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#007bff' }}>
            {day.toUpperCase()}
          </h3>
          
          {itinerary[day].length === 0 ? (
            <p style={{ color: '#888', fontSize: '13px', margin: '5px 0' }}>추가된 장소가 없습니다.</p>
          ) : (
            <ul style={{ paddingLeft: '0', listStyle: 'none', margin: '0 0 10px 0' }}>
              {itinerary[day].map((place, idx) => {
                const placeKey = getPlaceKey(day, place);

                return (
                <li key={placeKey} ref={(element) => itemRefs.current.set(placeKey, element)} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: '13px',
                  cursor: 'grab'
                }}>
                  <span
                    draggable
                    onDragStart={() => setDraggedItem({ day, index: idx })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedItem && draggedItem.day === day) {
                        onReorder(day, draggedItem.index, idx);
                      }
                      setDraggedItem(null);
                    }}
                    onDragEnd={() => setDraggedItem(null)}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px', flex: 1 }}
                  >
                    <strong>{idx + 1}. {place.title}</strong>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={() => onReorder(day, idx, idx - 1)}
                      disabled={idx === 0}
                      aria-label="위로 이동"
                      title="위로 이동"
                      style={{
                        width: '24px',
                        height: '24px',
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        color: idx === 0 ? '#ccc' : '#555',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        fontSize: '18px',
                        lineHeight: 1
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => onDeletePlace(day, idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff4d4f',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          <button 
            onClick={() => onOptimize(day)}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {day.toUpperCase()} 최적 동선 만들기
          </button>
        </div>
      ))}
    </div>
  );
};

export default Sidebar;