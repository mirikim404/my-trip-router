import Search from './Search';

const Sidebar = ({ itinerary, onAddPlace, onDeletePlace, onOptimize }) => {
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
              {itinerary[day].map((place, idx) => (
                <li key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: '13px'
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px' }}>
                    <strong>{idx + 1}. {place.title}</strong>
                  </span>
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
                </li>
              ))}
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