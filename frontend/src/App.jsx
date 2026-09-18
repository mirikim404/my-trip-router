// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { optimizeRouteNearestNeighbor } from './utils/tspAlgo';

function App() {
  // 환경변수로 백엔드 API 주소 설정 (로컬: http://localhost:3001, 배포시: Render 주소)
  // .env 파일이 없거나 값을 못 읽어오면 기본값으로 로컬 주소를 사용합니다.
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  // 1. 로컬 스토리지에서 기존 여행 일정 불러오기 (없으면 기본값 세팅)
  const [itinerary, setItinerary] = useState(() => {
    const saved = localStorage.getItem('myTripPlan');
    return saved ? JSON.parse(saved) : { day1: [], day2: [] };
  });

  // 2. 일정이 변경될 때마다 로컬 스토리지에 자동 저장
  useEffect(() => {
    localStorage.setItem('myTripPlan', JSON.stringify(itinerary));
  }, [itinerary]);

  // 장소 검색 테스트 함수
  const searchPlace = async (keyword) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/search`, {
        params: { query: keyword }
      });
      console.log('검색 결과:', res.data.items);
      alert('개발자 도구(F12) 콘솔창에서 검색 결과를 확인하세요!');
      // TODO: 검색 결과를 UI에 띄우고 사용자가 선택하면 addPlace() 호출
    } catch (error) {
      console.error('검색 중 오류 발생:', error);
    }
  };

  // 특정 Day에 장소 추가 함수 (이후 검색 결과 목록에서 클릭 시 사용)
  const addPlace = (day, placeData) => {
    setItinerary(prev => ({
      ...prev,
      [day]: [...prev[day], placeData]
    }));
  };

  // 최적 동선 계산 및 네이버 지도 렌더링 호출 함수
  const optimizeAndDrawRoute = async (day) => {
    const places = itinerary[day];
    if (places.length < 2) return alert('장소가 2개 이상 필요합니다.');

    // 1. TSP 알고리즘을 태워 순서를 정렬합니다.
    const optimizedPlaces = optimizeRouteNearestNeighbor(places);
    console.log(`${day} 최적화된 순서:`, optimizedPlaces);

    // 2. 출발지, 도착지, 경유지 포맷팅 (경도,위도 형식)
    const start = `${optimizedPlaces[0].lng},${optimizedPlaces[0].lat}`;
    const goal = `${optimizedPlaces[optimizedPlaces.length - 1].lng},${optimizedPlaces[optimizedPlaces.length - 1].lat}`;
    
    // 중간 경유지들을 | 로 연결 (없으면 빈 문자열)
    const waypoints = optimizedPlaces.slice(1, -1).map(p => `${p.lng},${p.lat}`).join('|');

    try {
      // 3. 백엔드 프록시로 길찾기 요청
      const res = await axios.post(`${API_BASE_URL}/api/directions`, {
        start, goal, waypoints
      });

      console.log('경로 데이터:', res.data);
      alert('경로 탐색 성공! 콘솔창(F12)을 확인하세요.');
      // TODO: 4. 응답받은 Polyline 데이터를 네이버 지도 객체에 그려주기
    } catch (error) {
      console.error('경로 탐색 중 오류 발생:', error);
      alert('경로 탐색 중 오류가 발생했습니다. 백엔드 서버가 켜져 있는지 확인해 주세요.');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* 사이드바: 일정 관리 영역 */}
      <div style={{ width: '350px', padding: '20px', borderRight: '1px solid #ccc', overflowY: 'auto', backgroundColor: '#fff' }}>
        <h2 style={{ marginTop: 0 }}>나만의 플래너 🗺️</h2>
        
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 'bold' }}>장소 검색 테스트</p>
          <button onClick={() => searchPlace('해운대 맛집')} style={{ padding: '8px 12px', cursor: 'pointer' }}>
            '해운대 맛집' 검색
          </button>
        </div>
        
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
        
        {/* 개발용 더미 데이터 삽입 버튼 */}
        <button 
          onClick={() => {
            setItinerary({
              day1: [
                { title: '해운대 해수욕장', lat: 35.1587, lng: 129.1604 }, // 도착지
                { title: '부산역 (출발)', lat: 35.1152, lng: 129.0422 },   // 출발지
                { title: '광안리 해수욕장', lat: 35.1532, lng: 129.1186 }    // 경유지
              ],
              day2: []
            })
          }}
          style={{ marginTop: '40px', padding: '8px', fontSize: '12px', backgroundColor: '#e2e3e5', border: '1px solid #ccc', borderRadius: '4px', width: '100%', cursor: 'pointer' }}
        >
          (테스트용) 부산 여행 샘플 세팅
        </button>
      </div>

      {/* 메인: 네이버 지도 영역 */}
      <div id="map" style={{ flex: 1, backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6c757d' }}>네이버 지도가 렌더링될 영역입니다.</p>
        {/* 추후 여기에 <MapViewer /> 컴포넌트가 들어갑니다. */}
      </div>
    </div>
  );
}

export default App;