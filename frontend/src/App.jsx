import { useEffect, useMemo, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MapViewer from './components/MapViewer';
import { fetchSharedPlan, saveSharedPlan } from './api/shareApi';
import { PUBLIC_BASE_URL, resolveApiUrl } from './api/config';
import { useBottomSheet, BOTTOM_SHEET_PEEK_RATIO } from './utils/useBottomSheet';

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
  const [view, setView] = useState('select');
  const [slotSelections, setSlotSelections] = useState({});

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

  const { profile, itinerary } = plan;
  const days = profile.days || [];

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
  
  const mapPlaces = slots.map((slot) => {
    const idx = slotSelections[slot.id] ?? slot.selectedIndex ?? 0;
    return slot.options[idx] || slot.options[0];
  });

  return (
    <main className="share-shell">
      <div className="share-map-pane">
        <MapViewer places={mapPlaces} fitToPlaces />
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
            <span>{slots.length}곳</span>
          </div>

          {slots.length === 0 ? (
            <p className="empty-state">아직 추가된 장소가 없어요.</p>
          ) : (
            <ol className="share-slots" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {slots.map((slot, index) => {
                const selectedIdx = slotSelections[slot.id] ?? slot.selectedIndex ?? 0;
                return (
                  <li key={slot.id} className="share-slot-item" style={{ paddingBottom: '20px' }}>
                    <div
                      className="share-slot-carousel"
                      style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                      onScroll={(e) => {
                        const width = e.target.clientWidth;
                        if (width === 0) return;
                        const newIndex = Math.round(e.target.scrollLeft / width);
                        if (newIndex !== selectedIdx && newIndex < slot.options.length) {
                          setSlotSelections((prev) => ({ ...prev, [slot.id]: newIndex }));
                        }
                      }}
                    >
                      {slot.options.map((place, optIdx) => (
                        <div key={`${place.lat}-${place.lng}-${optIdx}`} style={{ flex: '0 0 100%', scrollSnapAlign: 'start', paddingRight: '12px' }}>
                          <div className="share-place-card" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            {place.photoUrl && <img src={resolveApiUrl(place.photoUrl)} alt="" loading="lazy" style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />}
                            <div>
                              <strong style={{ display: 'block', fontSize: '15px', color: '#1e293b' }}>
                                {index + 1}. {slot.options.length > 1 && <span style={{ color: '#2563eb', marginRight: '6px' }}>{String.fromCharCode(65 + optIdx)}안</span>}
                                {place.title}
                              </strong>
                              <span style={{ display: 'block', fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{place.roadAddress || place.address || '주소 정보 없음'}</span>
                              {(place.primaryType || place.placeType) && <em style={{ display: 'block', fontSize: '12px', color: '#94a3b8', fontStyle: 'normal', marginTop: '4px' }}>{place.primaryType || place.placeType}</em>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {slot.options.length > 1 && (
                      <div className="share-slot-dots" style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px' }}>
                        {slot.options.map((_, dotIdx) => (
                          <span key={dotIdx} style={{ width: '6px', height: '6px', borderRadius: '50%', background: selectedIdx === dotIdx ? '#2563eb' : '#e2e8f0', transition: 'background 0.2s' }} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
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

  const handleCreateTrip = ({ travelerName, startDate, endDate }) => {
    const days = buildTripDays(startDate, endDate);
    setProfile({ travelerName, startDate, endDate, days });
    setItinerary((previous) => createEmptyItinerary(days, previous));
    setActiveDay(days[0]?.key || '');
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
      const { id } = await saveSharedPlan({ profile, itinerary }, currentShareId);
      
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
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  const handleSelectOption = (day, slotId, nextIndex) => {
    setItinerary((previous) => ({
      ...previous,
      [day]: (previous[day] || []).map((slot) => (
        slot.id === slotId ? { ...slot, selectedIndex: nextIndex } : slot
      )),
    }));
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
    setShareStatus((previous) => ({ ...previous, url: '', copied: false }));
  };

  if (shareId) return <SharePlanPage shareId={shareId} />;
  if (!profile) return <SignupScreen onCreateTrip={handleCreateTrip} />;

  const activeDayKey = profile.days.some((day) => day.key === activeDay) ? activeDay : profile.days[0]?.key || '';
  const mapPlaces = (itinerary[activeDayKey] || []).map(slot => slot.options[slot.selectedIndex ?? 0] || slot.options[0]).filter(Boolean);

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
        onResetTrip={handleResetTrip}
        onSharePlan={handleSharePlan}
        shareStatus={shareStatus}
      />
      <div className="map-pane">
        <MapViewer places={mapPlaces} fitToPlaces />
      </div>
    </div>
  );
}

export default App;