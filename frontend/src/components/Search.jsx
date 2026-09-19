import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api/config';

const Search = ({ days, onAddPlace }) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [selectedDay, setSelectedDay] = useState(days[0]?.key || '');
  const selectedDayKey = days.some((day) => day.key === selectedDay) ? selectedDay : days[0]?.key || '';
  const selectedDayLabel = days.find((day) => day.key === selectedDayKey);

  const handleSearch = async () => {
    if (!keyword.trim()) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/api/search`, {
        params: { query: keyword },
      });
      setResults(response.data.items || []);
    } catch (error) {
      console.error('검색 오류:', error);
      alert('검색 중 오류가 발생했어요.');
    }
  };

  const handleAdd = async (item) => {
    if (!selectedDayKey) return;

    const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');
    const categories = (item.category || '').split('>').map((category) => category.trim()).filter(Boolean);
    const rawLongitude = Number(item.mapx);
    const rawLatitude = Number(item.mapy);
    const longitude = Math.abs(rawLongitude) > 180 ? rawLongitude / 10000000 : rawLongitude;
    const latitude = Math.abs(rawLatitude) > 90 ? rawLatitude / 10000000 : rawLatitude;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      alert('검색 결과의 위치를 변환하지 못했어요. 다른 장소를 선택해주세요.');
      return;
    }

    let googleDetails = {};
    try {
      const detailsResponse = await axios.post(`${API_BASE_URL}/api/place-details`, {
        title: cleanTitle,
        address: item.roadAddress || item.address,
        lat: latitude,
        lng: longitude,
      });
      googleDetails = detailsResponse.data;
    } catch (error) {
      console.warn('Google 장소 상세 정보를 불러오지 못했습니다.', error);
    }

    onAddPlace(selectedDayKey, {
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
      lng: longitude,
    });
  };

  return (
    <section className="search-panel" aria-label="장소 검색">
      <div className="search-header">
        <h3>장소 검색</h3>
        <select
          value={selectedDayKey}
          onChange={(event) => setSelectedDay(event.target.value)}
          aria-label="장소를 추가할 날짜"
        >
          {days.map((day) => (
            <option key={day.key} value={day.key}>
              {day.label} · {day.displayDate}
            </option>
          ))}
        </select>
      </div>

      <div className="search-box">
        <input
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
          placeholder="예: 성수동 맛집"
        />
        <button onClick={handleSearch}>검색</button>
      </div>

      <ul className="search-results">
        {results.map((item, index) => {
          const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');

          return (
            <li key={`${cleanTitle}-${index}`}>
              <div>
                <strong>{cleanTitle}</strong>
                <span>{item.roadAddress || item.address || '주소 정보 없음'}</span>
              </div>

              <button onClick={() => handleAdd(item)}>
                {selectedDayLabel ? `${selectedDayLabel.label}에 추가` : '추가'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default Search;
