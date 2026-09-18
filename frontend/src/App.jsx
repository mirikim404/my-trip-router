import { useState, useEffect } from 'react';
import axios from 'axios';
import { optimizeRouteNearestNeighbor } from './utils/tspAlgo';
import MapViewer from './components/MapViewer';
import Search from './components/Search';

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('myTripPlan');
    return saved ? JSON.parse(saved) : { day1: [], day2: [] };
  });
  const [currentPlaces, setCurrentPlaces] = useState([]);
  const [currentRoute, setCurrentRoute] = useState(null);

  useEffect(() => {
    localStorage.setItem('myTripPlan', JSON.stringify(itinerary));
  }, [itinerary]);

  const addPlace = (day, placeData) => {
    setItinerary(prev => ({
      ...prev,
      [day]: [...prev[day], placeData]
    }));
  };

  const optimizeAndDrawRoute = async (day) => {
    const places = itinerary[day];
    if (places.length < 2) return alert('장소가 2개 이상 필요합니다.');

    const optimizedPlaces = optimizeRouteNearestNeighbor(places);
    console.log(`${day} 최적화된 순서:`, optimizedPlaces);
    setCurrentPlaces(optimizedPlaces);

    const start = `${optimizedPlaces[0].lng},${optimizedPlaces[0].lat}`;
    const goal = `${optimizedPlaces[optimizedPlaces.length - 1].lng},${optimizedPlaces[optimizedPlaces.length - 1].lat}`;
    const waypoints = optimizedPlaces.slice(1, -1).map(p => `${p.lng},${p.lat}`).join('|');

    try {
      const res = await axios.post(`${API_BASE_URL}/api/directions`, {
        start, goal, waypoints
      });

      setCurrentRoute(res.data);
      alert('경로 탐색 성공! 콘솔창(F12)을 확인하세요.');
    } catch (error) {
      console.error('경로 탐색 중 오류 발생:', error);
      alert('경로 탐색 중 오류가 발생했습니다. 백엔드 서버가 켜져 있는지 확인해 주세요.');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ width: '350px', padding: '20px', borderRight: '1px solid #ccc', overflowY: 'auto', backgroundColor: '#fff' }}>
        <h2 style={{ marginTop: 0 }}>나만의 플래너 🗺️</h2>
        
        <Search onAddPlace={addPlace} />
        
        {Object.keys(itinerary).map((day) => (
          <div key={day} style={{ marginBottom: '30px' }}>
            <h3 style={{ borderBottom: '2px solid #333', paddingBottom: '5px' }}>
              {day.toUpperCase()}
            </h3>
            {itinerary[day].length === 0 ? (
              <p style={{ color: '#888', fontSize: '14px' }}>추가된 장소가 없습니다.</p>
            ) : (
              <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
                {itinerary[day].map((place, idx) => (
                  <li key={idx} style={{ marginBottom: '10px' }}>
                    <strong>{place.title}</strong>
                    <br />
                    <span style={{ color: '#666', fontSize: '12px' }}>{place.lat}, {place.lng}</span>
                  </li>
                ))}
              </ul>
            )}
            
            <button 
              onClick={() => optimizeAndDrawRoute(day)}
              style={{ width: '100%', padding: '10px', marginTop: '10px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
            >
              최적 동선 만들기
            </button>
          </div>
        ))}
        
        <button 
          onClick={() => {
            setItinerary({
              day1: [
                { title: '해운대 해수욕장', lat: 35.1587, lng: 129.1604 },
                { title: '부산역 (출발)', lat: 35.1152, lng: 129.0422 },
                { title: '광안리 해수욕장', lat: 35.1532, lng: 129.1186 }
              ],
              day2: []
            })
          }}
          style={{ marginTop: '40px', padding: '8px', fontSize: '12px', backgroundColor: '#e2e3e5', border: '1px solid #ccc', borderRadius: '4px', width: '100%', cursor: 'pointer' }}
        >
          (테스트용) 부산 여행 샘플 세팅
        </button>
      </div>

      <div id="map-container" style={{ flex: 1, backgroundColor: '#e9ecef' }}>
        <MapViewer places={currentPlaces} routeData={currentRoute} />
      </div>
    </div>
  );
}

export default App;