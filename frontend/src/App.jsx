import { useEffect, useMemo, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MapViewer from './components/MapViewer';
import { fetchTransitDirections } from './api/naverApi';
import { fetchSharedPlan, saveSharedPlan } from './api/shareApi';
import { PUBLIC_BASE_URL, resolveApiUrl } from './api/config';
import { useBottomSheet, BOTTOM_SHEET_PEEK_RATIO } from './utils/useBottomSheet';

const PROFILE_STORAGE_KEY = 'myTripProfile';
const PLAN_STORAGE_KEY = 'myTripPlan';
const ROUTES_STORAGE_KEY = 'myTripRoutes';

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

// itinerary[day]의 각 항목("슬롯")을 구분하기 위한 id.
// 슬롯은 { id, options: [place, ...], selectedIndex } 형태로,
// 장소 하나를 다른 장소 위로 드래그해서 합치면 options가 2개 이상이 된다.
let slotIdSeed = 0;
const createSlotId = () => `slot-${Date.now()}-${slotIdSeed++}`;

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

// 공유 화면의 진입 페이지: 트래블러 이름/날짜 같은, 지도를 볼 때는 필요
// 없는 정보와 day 선택을 여기서 한 번에 끝낸다. 이후 지도 페이지에는
// 선택한 day 하나만 남기고, 이 정보들은 다시 보여주지 않는다.
function ShareEntryPage({ profile, itinerary, onSelectDay }) {
  const days = profile.days || [];

  return (
    <main className="share-entry">
      <header className="share-entry-hero">
        <p>공유된 여행 일정</p>
        <h1>{profile.travelerName}의 여행</h1>
        <span>{days[0]?.displayDate} - {days[days.length - 1]?.displayDate}</span>
      </header>

      <div className="share-entry-days">
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            className="share-entry-day"
            onClick={() => onSelectDay(day.key)}
          >
            <strong>{day.label}</strong>
            <span>{day.displayDate}</span>
            <em>{itinerary[day.key]?.length || 0}곳</em>
          </button>
        ))}
      </div>
    </main>
  );
}

function SharePlanPage({ shareId }) {
  const [plan, setPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [status, setStatus] = useState('loading');
  // 'select': day를 고르는 진입 페이지 / 'map': 고른 day의 지도 페이지
  const [view, setView] = useState('select');

  const {
    sheetHeight,
    isSheetDragging,
    cycleSheetHeight,
    handleSheetPointerDown,
    handleSheetPointerMove,
    handleSheetPointerUp,
  } = useBottomSheet({ initialHeightRatio: BOTTOM_SHEET_PEEK_RATIO });

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const sharedPlan = await fetchSharedPlan(shareId);
        setPlan(sharedPlan);
        setSelectedDay(sharedPlan.profile.days[0]?.key || '');
        document.title = `${sharedPlan.profile.travelerName}의 여행 · My Trip Router`;
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

  const { profile, itinerary, routesByDay = {} } = plan;
  const days = profile.days || [];
  // 공유된 itinerary도 슬롯({ id, options, selectedIndex }) 형태이므로,
  // 보여줄 때는 각 슬롯이 현재 가리키는 옵션(장소) 하나로 펼쳐서 쓴다.
  const toActivePlace = (slot) => slot.options?.[slot.selectedIndex ?? 0] || slot;

  if (view === 'select') {
    return (
      <ShareEntryPage
        profile={profile}
        itinerary={itinerary}
        onSelectDay={(dayKey) => {
          setSelectedDay(dayKey);
          setView('map');
        }}
      />
    );
  }

  const activeDay = days.find((day) => day.key === selectedDay) || days[0];
  const slots = activeDay ? itinerary[activeDay.key] || [] : [];
  const places = slots.map(toActivePlace);
  const activeDayRoute = activeDay ? routesByDay[activeDay.key] : null;
  // 경로가 만들어져 있으면 정렬된 순서(출발→도착)로 지도를 그리고, 없으면
  // 저장된 목록 그대로 마커만 보여준다.
  const mapPlaces = activeDayRoute?.places || places;
  const mapRouteData = activeDayRoute?.routeData || null;

  return (
    <main className="share-shell">
      <div className="share-map-pane">
        <MapViewer places={mapPlaces} routeData={mapRouteData} fitToPlaces />
      </div>

      <section
        className={`share-sheet${isSheetDragging ? ' dragging' : ''}`}
        style={{ '--sheet-height': `${sheetHeight}px` }}
        aria-label="여행 일정"
      >
        <div
          className="sheet-handle"
          role="button"
          tabIndex={0}
          aria-label="목록 크기 조절 (드래그하거나 탭하세요)"
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              cycleSheetHeight();
            }
          }}
        />

        <div className="share-sheet-topbar">
          <button
            type="button"
            className="share-back-btn"
            onClick={() => setView('select')}
          >
            ← 다른 날짜
          </button>
        </div>

        <div className="share-list" aria-label={`${activeDay?.label || 'Day'} 장소 목록`}>
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
                  {place.photoUrl && <img src={resolveApiUrl(place.photoUrl)} alt="" loading="lazy" />}
                  <div>
                    <strong>{place.title}</strong>
                    <span>{place.roadAddress || place.address || '주소 정보 없음'}</span>
                    {place.primaryType || place.placeType ? <em>{place.primaryType || place.placeType}</em> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
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
  const [routesByDay, setRoutesByDay] = useState(() => loadJson(ROUTES_STORAGE_KEY) || {});
  const [activeDay, setActiveDay] = useState(() => initialProfile?.days?.[0]?.key || '');
  const [shareStatus, setShareStatus] = useState({ isSaving: false, url: '', copied: false });
  
  const [currentShareId, setCurrentShareId] = useState(() => localStorage.getItem('currentPlanId') || null);

  useEffect(() => {
    if (shareId) return;
    if (profile) {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, [profile, shareId]);

  useEffect(() => {
    if (!shareId) localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(itinerary));
  }, [itinerary, shareId]);

  useEffect(() => {
    if (!shareId) localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routesByDay));
  }, [routesByDay, shareId]);

  const clearDayRoute = (day) => {
    setRoutesByDay((previous) => {
      if (!previous[day]) return previous;
      const next = { ...previous };
      delete next[day];
      return next;
    });
  };

  const handleCreateTrip = ({ travelerName, startDate, endDate }) => {
    const days = buildTripDays(startDate, endDate);
    setProfile({ travelerName, startDate, endDate, days });
    setItinerary((previous) => createEmptyItinerary(days, previous));
    setActiveDay(days[0]?.key || '');
    setRoutesByDay({});
    setShareStatus({ isSaving: false, url: '', copied: false });
    
    setCurrentShareId(null);
    localStorage.removeItem('currentPlanId');
  };

  const handleResetTrip = () => {
    const shouldReset = window.confirm('여행 날짜를 다시 설정할까요? 기존 장소는 같은 Day 번호에 남겨둘게요.');
    if (!shouldReset) return;

    setProfile(null);
    setShareStatus({ isSaving: false, url: '', copied: false });
    
    setCurrentShareId(null);
    localStorage.removeItem('currentPlanId');
  };

  const handleSharePlan = async () => {
    if (!profile) return;
    setShareStatus((previous) => ({ ...previous, isSaving: true, copied: false }));

    try {
      const { id } = await saveSharedPlan({ profile, itinerary, routesByDay }, currentShareId);
      
      if (!currentShareId) {
        setCurrentShareId(id);
        localStorage.setItem('currentPlanId', id);
      }

      const url = `${PUBLIC_BASE_URL || window.location.origin}/share/${id}`;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }

      setShareStatus({ isSaving: false, url, copied });
    } catch (error) {
      console.error(error);
      alert('공유 링크를 만들지 못했어요. 백엔드 서버가 켜져 있는지 확인해주세요.');
      setShareStatus((previous) => ({ ...previous, isSaving: false }));
    }
  };

  const handleAddPlace = (day, placeData) => {
    const slot = { id: createSlotId(), options: [placeData], selectedIndex: 0 };
    setItinerary((previous) => ({
      ...previous,
      [day]: [...(previous[day] || []), slot],
    }));
    clearDayRoute(day);
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleDeletePlace = (day, indexToRemove) => {
    setItinerary((previous) => {
      const slots = previous[day] || [];
      const slot = slots[indexToRemove];
      if (!slot) return previous;

      if (slot.options.length > 1) {
        const nextOptions = slot.options.filter((_, i) => i !== (slot.selectedIndex ?? 0));
        return {
          ...previous,
          [day]: slots.map((item, index) => (
            index === indexToRemove ? { ...item, options: nextOptions, selectedIndex: 0 } : item
          )),
        };
      }
      return { ...previous, [day]: slots.filter((_, index) => index !== indexToRemove) };
    });
    clearDayRoute(day);
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleSelectOption = (day, slotId, nextIndex) => {
    setItinerary((previous) => ({
      ...previous,
      [day]: (previous[day] || []).map((slot) => (
        slot.id === slotId ? { ...slot, selectedIndex: nextIndex } : slot
      )),
    }));
    clearDayRoute(day);
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleMergeIntoSlot = (day, fromSlotId, toSlotId) => {
    if (fromSlotId === toSlotId) return;

    setItinerary((previous) => {
      const slots = previous[day] || [];
      const fromSlot = slots.find((slot) => slot.id === fromSlotId);
      const toSlot = slots.find((slot) => slot.id === toSlotId);
      if (!fromSlot || !toSlot) return previous;

      const fromIndex = fromSlot.selectedIndex ?? 0;
      const movingOption = fromSlot.options[fromIndex];
      const remainingOptions = fromSlot.options.filter((_, i) => i !== fromIndex);

      const nextSlots = slots.map((slot) => {
        if (slot.id === toSlotId) return { ...slot, options: [...slot.options, movingOption] };
        if (slot.id === fromSlotId) return remainingOptions.length > 0 ? { ...slot, options: remainingOptions, selectedIndex: 0 } : null;
        return slot;
      }).filter(Boolean);

      return { ...previous, [day]: nextSlots };
    });
    clearDayRoute(day);
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
    clearDayRoute(day);
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleOptimizeRoute = async (day, selectedPlaces) => {
    const places = selectedPlaces;
    if (places.length < 2) return alert('경로를 만들 장소를 2개 이상 선택해주세요.');
    if (places.some((place) => !Number.isFinite(place.lat) || !Number.isFinite(place.lng))) return alert('장소 좌표를 확인할 수 없어요.');

    try {
      const routeData = await fetchTransitDirections(places);
      const optimizedPlaces = routeData.places || places;
      setRoutesByDay((previous) => ({
        ...previous,
        [day]: { places: optimizedPlaces, routeData },
      }));
    } catch (error) {
      const data = error.response?.data;
      const details = data?.details;
      const message = data?.error
        || (typeof details === 'string' ? details : details?.message || details?.error?.message);
      alert(message || '경로 탐색에 실패했어요.');
    }
  };

  if (shareId) return <SharePlanPage shareId={shareId} />;
  if (!profile) return <SignupScreen onCreateTrip={handleCreateTrip} />;

  const activeDayKey = profile.days.some((day) => day.key === activeDay) ? activeDay : profile.days[0]?.key || '';
  const activeDayRoute = routesByDay[activeDayKey];
  const mapPlaces = activeDayRoute?.places || [];
  const mapRouteData = activeDayRoute?.routeData || null;

  return (
    <div className="app-shell">
      <Sidebar
        profile={profile}
        days={profile.days}
        itinerary={itinerary}
        activeDay={activeDayKey}
        onSelectDay={setActiveDay}
        onAddPlace={handleAddPlace}
        onDeletePlace={handleDeletePlace}
        onReorder={handleReorderPlaces}
        onMergeIntoSlot={handleMergeIntoSlot}
        onSelectOption={handleSelectOption}
        onOptimize={handleOptimizeRoute}
        onResetTrip={handleResetTrip}
        onSharePlan={handleSharePlan}
        shareStatus={shareStatus}
      />
      <div className="map-pane">
        <MapViewer places={mapPlaces} routeData={mapRouteData} fitToPlaces />
      </div>
    </div>
  );
}

export default App;