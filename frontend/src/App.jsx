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

  const handleOptimizeRoute = async (day) => {
    const places = itinerary[day];
    
    if (places.length < 2) {
      alert('동선을 계산하려면 장소가 2개 이상 필요합니다.');
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
      alert('실제 도로 기준 경로를 찾을 수 없습니다. 섬이나 바다를 건너는 구간이 있는지 확인해주세요.');
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', margin: 0, padding: 0, fontFamily: 'sans-serif' }}>
      
      <Sidebar 
        itinerary={itinerary}
        onAddPlace={handleAddPlace}
        onDeletePlace={handleDeletePlace}
        onOptimize={handleOptimizeRoute}
      />
      
      <div style={{ flex: 1, position: 'relative' }}>
        <MapViewer places={currentPlaces} routeData={currentRoute} />
      </div>
      
    </div>
  );
}

export default App;