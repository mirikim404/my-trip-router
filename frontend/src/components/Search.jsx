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

  const handleAdd = async (day, item) => {
    const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');
    const categories = (item.category || '').split('>').map(category => category.trim()).filter(Boolean);
    const rawLongitude = Number(item.mapx);
    const rawLatitude = Number(item.mapy);
    const longitude = Math.abs(rawLongitude) > 180 ? rawLongitude / 10000000 : rawLongitude;
    const latitude = Math.abs(rawLatitude) > 90 ? rawLatitude / 10000000 : rawLatitude;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      alert('검색 결과의 위치를 변환하지 못했습니다. 다른 장소를 선택해주세요.');
      return;
    }

    let googleDetails = {};
    try {
      const detailsResponse = await axios.post(`${API_BASE_URL}/api/place-details`, {
        title: cleanTitle,
        address: item.roadAddress || item.address,
        lat: latitude,
        lng: longitude
      });
      googleDetails = detailsResponse.data;
      if (googleDetails.photoUrl?.startsWith('/')) {
        googleDetails.photoUrl = `${API_BASE_URL}${googleDetails.photoUrl}`;
      }
    } catch (error) {
      console.warn('Google 장소 상세 정보를 불러오지 못했습니다.', error);
    }

    onAddPlace(day, {
      title: cleanTitle,
      address: item.address,
      roadAddress: item.roadAddress,
      category: item.category,
      placeType: categories[0] || '',
      subcategory: categories.slice(1).join(' > '),
      telephone: item.telephone,
      link: item.link,
      naverMapLink: `https://map.naver.com/p/search/${encodeURIComponent(cleanTitle)}`,
      ...googleDetails,
      lat: latitude,
      lng: longitude
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