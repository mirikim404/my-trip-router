import { useState } from 'react';
import axios from 'axios';

const Search = ({ onAddPlace }) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    
    try {
      const res = await axios.get(`${API_BASE_URL}/api/search`, {
        params: { query: keyword }
      });
      setResults(res.data.items);
    } catch (error) {
      console.error('검색 오류:', error);
      alert('검색 중 오류가 발생했습니다.');
    }
  };

  const handleAdd = (day, item) => {
    if (!window.naver || !window.naver.maps) {
      return alert('지도 API가 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
    }

    const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');
    const tm128Point = new window.naver.maps.Point(
      parseInt(item.mapx, 10),
      parseInt(item.mapy, 10)
    );
    const latLng = window.naver.maps.TransCoord.fromTM128ToLatLng(tm128Point);

    onAddPlace(day, {
      title: cleanTitle,
      address: item.address,
      lat: latLng.y,
      lng: latLng.x
    });
  };

  return (
    <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
      <h3 style={{ marginTop: 0, fontSize: '16px' }}>장소 검색</h3>
      
      <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
        <input 
          type="text" 
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="예: 해운대 맛집"
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={handleSearch} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          검색
        </button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
        {results.map((item, idx) => {
          const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');
          
          return (
            <li key={idx} style={{ padding: '10px', borderBottom: '1px solid #ddd', fontSize: '14px' }}>
              <div style={{ fontWeight: 'bold' }}>{cleanTitle}</div>
              <div style={{ color: '#666', fontSize: '12px', marginBottom: '5px' }}>{item.address}</div>
              
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => handleAdd('day1', item)} style={{ fontSize: '11px', cursor: 'pointer' }}>
                  + Day 1 추가
                </button>
                <button onClick={() => handleAdd('day2', item)} style={{ fontSize: '11px', cursor: 'pointer' }}>
                  + Day 2 추가
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Search;