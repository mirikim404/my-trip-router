import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MapViewer from './components/MapViewer';
import { optimizeRouteNearestNeighbor } from './utils/tspAlgo';
import { fetchDirections } from './api/naverApi';

function App() {
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('myTripPlan');
    return saved ? JSON.parse(saved) : { day1: [], day2: [] };
  });

  const [currentPlaces, setCurrentPlaces] = useState([]);
  const [currentRoute, setCurrentRoute] = useState(null);

  useEffect(() => {
    localStorage.setItem('myTripPlan', JSON.stringify(itinerary));
  }, [itinerary]);

  const handleAddPlace = (day, placeData) => {
    setItinerary(prev => ({
      ...prev,
      [day]: [...prev[day], placeData]
    }));
  };

  const handleDeletePlace = (day, indexToRemove) => {
    setItinerary(prev => ({
      ...prev,
      [day]: prev[day].filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleReorderPlaces = (day, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    setItinerary(prev => {
      const places = [...prev[day]];
      const [movedPlace] = places.splice(fromIndex, 1);
      places.splice(toIndex, 0, movedPlace);
      return { ...prev, [day]: places };
    });
    setCurrentPlaces([]);
    setCurrentRoute(null);
  };

  const handleOptimizeRoute = async (day) => {
    const places = itinerary[day];
    
    if (places.length < 2) {
      alert('동선을 계산하려면 장소가 2개 이상 필요합니다.');
      return;
    }

    if (places.some(place => !Number.isFinite(place.lat) || !Number.isFinite(place.lng))) {
      alert('장소 좌표를 확인할 수 없습니다. 검색 결과를 다시 추가해주세요.');
      return;
    }

    const optimizedPlaces = optimizeRouteNearestNeighbor(places);
    setCurrentPlaces(optimizedPlaces);

    const start = `${optimizedPlaces[0].lng},${optimizedPlaces[0].lat}`;
    const goal = `${optimizedPlaces[optimizedPlaces.length - 1].lng},${optimizedPlaces[optimizedPlaces.length - 1].lat}`;
    
    let waypoints = '';
    if (optimizedPlaces.length > 2) {
      waypoints = optimizedPlaces.slice(1, -1).map(p => `${p.lng},${p.lat}`).join('|');
    }

    try {
      const routeData = await fetchDirections(start, goal, waypoints);
      setCurrentRoute(routeData);

      setItinerary(prev => ({
        ...prev,
        [day]: optimizedPlaces
      }));
      
    } catch (error) {
      console.error('경로 탐색 중 오류 발생:', error);
      const details = error.response?.data?.details;
      const message = typeof details === 'string'
        ? details
        : details?.message || details?.error?.message;
      alert(message || '경로 탐색에 실패했습니다. 출발지와 도착지의 위치를 확인해주세요.');
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', margin: 0, padding: 0, fontFamily: 'sans-serif' }}>
      
      <Sidebar 
        itinerary={itinerary}
        onAddPlace={handleAddPlace}
        onDeletePlace={handleDeletePlace}
        onReorder={handleReorderPlaces}
        onOptimize={handleOptimizeRoute}
      />
      
      <div style={{ flex: 1, position: 'relative' }}>
        <MapViewer places={currentPlaces} routeData={currentRoute} />
      </div>
      
    </div>
  );
}

export default App;