import { useEffect, useMemo, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MapViewer from './components/MapViewer';
import { fetchTransitDirections } from './api/naverApi';
import { fetchSharedPlan, saveSharedPlan } from './api/shareApi';

const PROFILE_STORAGE_KEY = 'myTripProfile';
const PLAN_STORAGE_KEY = 'myTripPlan';

const parseDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatDateLabel = (dateValue) => {
  const date = parseDate(dateValue);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const buildTripDays = (startDate, endDate) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = `day${days.length + 1}`;
    const dateValue = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, '0'),
      String(cursor.getDate()).padStart(2, '0'),
    ].join('-');

    days.push({
      key,
      label: `Day ${days.length + 1}`,
      date: dateValue,
      displayDate: formatDateLabel(dateValue),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

const createEmptyItinerary = (days, previous = {}) => (
  days.reduce((nextItinerary, day) => ({
    ...nextItinerary,
    [day.key]: Array.isArray(previous[day.key]) ? previous[day.key] : [],
  }), {})
);

const loadJson = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const getShareIdFromPath = () => {
  const match = window.location.pathname.match(/^\/share\/([^/]+)/);
  return match?.[1] || null;
};

function SignupScreen({ onCreateTrip }) {
  const [travelerName, setTravelerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const canSubmit = travelerName.trim() && startDate && endDate;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (start > end) {
      alert('마지막 날짜가 시작 날짜보다 빠를 수 없어요.');
      return;
    }

    onCreateTrip({
      travelerName: travelerName.trim(),
      startDate,
      endDate,
    });
  };

  return (
    <main className="signup-screen">
      <section className="signup-panel" aria-labelledby="signup-title">
        <div>
          <p className="eyebrow">My Trip Router</p>
          <h1 id="signup-title">가볍게 여행 일정을 열어볼게요</h1>
          <p className="signup-copy">
            계정을 만들 필요 없이 이름과 여행 날짜만 넣으면 날짜별 경로 보드가 바로 만들어집니다.
          </p>
        </div>

        <form className="signup-form" onSubmit={handleSubmit}>
          <label>
            이름 또는 닉네임
            <input
              type="text"
              value={travelerName}
              onChange={(event) => setTravelerName(event.target.value)}
              placeholder="예: 민지"
              autoFocus
            />
          </label>

          <div className="date-grid">
            <label>
              시작 날짜
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  if (endDate && parseDate(event.target.value) > parseDate(endDate)) {
                    setEndDate(event.target.value);
                  }
                }}
              />
            </label>

            <label>
              마지막 날짜
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <button type="submit" disabled={!canSubmit}>
            일정 만들기
          </button>
        </form>
      </section>
    </main>
  );
}

function SharePlanPage({ shareId }) {
  const [plan, setPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const sharedPlan = await fetchSharedPlan(shareId);
        setPlan(sharedPlan);
        setSelectedDay(sharedPlan.profile.days[0]?.key || '');
        setStatus('ready');
      } catch (error) {
        console.error('공유 일정을 불러오지 못했습니다:', error);
        setStatus('error');
      }
    };

    loadPlan();
  }, [shareId]);

  if (status === 'loading') {
    return (
      <main className="share-state">
        <p>공유 일정을 불러오는 중이에요.</p>
      </main>
    );
  }

  if (status === 'error' || !plan) {
    return (
      <main className="share-state">
        <h1>공유 일정을 찾을 수 없어요</h1>
        <p>링크가 잘못됐거나 저장된 일정이 삭제되었을 수 있습니다.</p>
      </main>
    );
  }

  const { profile, itinerary } = plan;
  const days = profile.days || [];
  const activeDay = days.find((day) => day.key === selectedDay) || days[0];
  const places = activeDay ? itinerary[activeDay.key] || [] : [];
  const totalPlaces = days.reduce((total, day) => total + (itinerary[day.key]?.length || 0), 0);

  return (
    <main className="share-shell">
      <section className="share-content">
        <header className="share-hero">
          <p>공유된 여행 일정</p>
          <h1>{profile.travelerName}의 여행</h1>
          <span>{days[0]?.displayDate} - {days[days.length - 1]?.displayDate} · {totalPlaces}곳</span>
        </header>

        <nav className="share-day-tabs" aria-label="날짜 선택">
          {days.map((day) => (
            <button
              key={day.key}
              className={day.key === activeDay?.key ? 'active' : ''}
              onClick={() => setSelectedDay(day.key)}
            >
              <strong>{day.label}</strong>
              <span>{day.displayDate}</span>
            </button>
          ))}
        </nav>

        <section className="share-list" aria-label={`${activeDay?.label || 'Day'} 장소 목록`}>
          <div className="share-list-header">
            <h2>{activeDay?.label}</h2>
            <span>{places.length}곳</span>
          </div>

          {places.length === 0 ? (
            <p className="empty-state">아직 추가된 장소가 없어요.</p>
          ) : (
            <ol>
              {places.map((place, index) => (
                <li key={`${place.title}-${place.lat}-${place.lng}-${index}`}>
                  {place.photoUrl && <img src={place.photoUrl} alt="" />}
                  <div>
                    <strong>{place.title}</strong>
                    <span>{place.roadAddress || place.address || '주소 정보 없음'}</span>
                    {place.primaryType || place.placeType ? <em>{place.primaryType || place.placeType}</em> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>

      <section className="share-map" aria-label="지도">
        <MapViewer places={places} routeData={null} />
      </section>
    </main>
  );
}

function App() {
  const shareId = getShareIdFromPath();
  const initialProfile = useMemo(() => loadJson(PROFILE_STORAGE_KEY), []);
  const [profile, setProfile] = useState(initialProfile);
  const [itinerary, setItinerary] = useState(() => {
    const savedPlan = loadJson(PLAN_STORAGE_KEY);
    return initialProfile?.days
      ? createEmptyItinerary(initialProfile.days, savedPlan || {})
      : savedPlan || {};
  });
  const [currentPlaces, setCurrentPlaces] = useState([]);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [shareStatus, setShareStatus] = useState({ isSaving: false, url: '', copied: false });

  useEffect(() => {
    if (shareId) return;

    if (profile) {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, [profile, shareId]);

  useEffect(() => {
    if (!shareId) {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(itinerary));
    }
  }, [itinerary, shareId]);

  const handleCreateTrip = ({ travelerName, startDate, endDate }) => {
    const days = buildTripDays(startDate, endDate);
    const nextProfile = { travelerName, startDate, endDate, days };

    setProfile(nextProfile);
    setItinerary((previous) => createEmptyItinerary(days, previous));
    setCurrentPlaces([]);
    setCurrentRoute(null);
    setShareStatus({ isSaving: false, url: '', copied: false });
  };

  const handleResetTrip = () => {
    const shouldReset = window.confirm('여행 날짜를 다시 설정할까요? 기존 장소는 같은 Day 번호에 남겨둘게요.');
    if (!shouldReset) return;

    setProfile(null);
    setCurrentPlaces([]);
    setCurrentRoute(null);
    setShareStatus({ isSaving: false, url: '', copied: false });
  };

  const handleSharePlan = async () => {
    if (!profile) return;

    setShareStatus((previous) => ({ ...previous, isSaving: true, copied: false }));

    try {
      const { id } = await saveSharedPlan({ profile, itinerary });
      const url = `${window.location.origin}/share/${id}`;

      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }

      setShareStatus({ isSaving: false, url, copied });
    } catch (error) {
      console.error('공유 링크 생성 실패:', error);
      alert('공유 링크를 만들지 못했어요. 백엔드 서버가 켜져 있는지 확인해주세요.');
      setShareStatus((previous) => ({ ...previous, isSaving: false }));
    }
  };

  const handleAddPlace = (day, placeData) => {
    setItinerary((previous) => ({
      ...previous,
      [day]: [...(previous[day] || []), placeData],
    }));
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleDeletePlace = (day, indexToRemove) => {
    setItinerary((previous) => ({
      ...previous,
      [day]: (previous[day] || []).filter((_, index) => index !== indexToRemove),
    }));
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleReorderPlaces = (day, fromIndex, toIndex) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= (itinerary[day] || []).length) return;

    setItinerary((previous) => {
      const places = [...(previous[day] || [])];
      const [movedPlace] = places.splice(fromIndex, 1);
      places.splice(toIndex, 0, movedPlace);
      return { ...previous, [day]: places };
    });
    setCurrentPlaces([]);
    setCurrentRoute(null);
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleOptimizeRoute = async (day, selectedPlaces) => {
    const places = selectedPlaces;

    if (places.length < 2) {
      alert('경로를 만들 장소를 2개 이상 선택해주세요.');
      return;
    }

    if (places.some((place) => !Number.isFinite(place.lat) || !Number.isFinite(place.lng))) {
      alert('장소 좌표를 확인할 수 없어요. 검색 결과를 다시 추가해주세요.');
      return;
    }

    try {
      const routeData = await fetchTransitDirections(places);
      const optimizedPlaces = routeData.places || places;
      setCurrentPlaces(optimizedPlaces);
      setCurrentRoute(routeData);
    } catch (error) {
      console.error('경로 탐색 중 오류가 발생했습니다:', error);
      const details = error.response?.data?.details;
      const message = typeof details === 'string'
        ? details
        : details?.message || details?.error?.message;
      alert(message || '경로 탐색에 실패했어요. 출발지와 도착지의 위치를 확인해주세요.');
    }
  };

  if (shareId) {
    return <SharePlanPage shareId={shareId} />;
  }

  if (!profile) {
    return <SignupScreen onCreateTrip={handleCreateTrip} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        profile={profile}
        days={profile.days}
        itinerary={itinerary}
        onAddPlace={handleAddPlace}
        onDeletePlace={handleDeletePlace}
        onReorder={handleReorderPlaces}
        onOptimize={handleOptimizeRoute}
        onResetTrip={handleResetTrip}
        onSharePlan={handleSharePlan}
        shareStatus={shareStatus}
      />

      <div className="map-pane">
        <MapViewer places={currentPlaces} routeData={currentRoute} />
      </div>
    </div>
  );
}

export default App;
