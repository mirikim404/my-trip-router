const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose'); // Mongoose 추가
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- MongoDB 연결 및 스키마 설정 시작 ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB 연결 성공!'))
  .catch((err) => console.error('MongoDB 연결 실패:', err));

const planSchema = new mongoose.Schema({
  shareId: { type: String, required: true, unique: true },
  planData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Plan = mongoose.model('Plan', planSchema);
// --- MongoDB 연결 및 스키마 설정 끝 ---


const createPlanId = () => crypto.randomBytes(5).toString('base64url');

const MAX_DAYS = 31;
const MAX_PLACES_PER_DAY = 50;

const isFinitePlace = (place) => (
  place && typeof place === 'object'
  && typeof place.title === 'string'
  && Number.isFinite(place.lat) && Number.isFinite(place.lng)
);

// itinerary[day]의 각 항목은 프론트와 마찬가지로 "슬롯"
// { id, options: [place, ...], selectedIndex } 형태다.
const isValidSlot = (slot) => (
  slot && typeof slot === 'object'
  && typeof slot.id === 'string' && slot.id
  && Array.isArray(slot.options) && slot.options.length > 0
  && slot.options.every(isFinitePlace)
);

const sanitizeSlot = ({ id, options, selectedIndex }) => ({
  id,
  options,
  selectedIndex: Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < options.length
    ? selectedIndex
    : 0,
});

// Google Directions 결과를 그대로 신뢰하지 않고, 지도에 그리는 데 필요한
// 형태(좌표 배열로 이루어진 legs.paths)로 좁혀서 저장한다.
const sanitizeRouteData = (routeData) => {
  if (!routeData || typeof routeData !== 'object') return null;
  if (routeData.provider !== 'google-transit') return null;
  if (!Array.isArray(routeData.places) || !routeData.places.every(isFinitePlace)) return null;
  if (!Array.isArray(routeData.legs)) return null;

  const legs = routeData.legs.map((leg) => {
    if (!leg || typeof leg !== 'object' || !Array.isArray(leg.paths)) return null;
    const paths = leg.paths.map((path) => {
      if (!Array.isArray(path)) return null;
      const points = path.map((point) => (
        point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
          ? { lat: point.lat, lng: point.lng }
          : null
      ));
      return points.every(Boolean) ? points : null;
    });
    return paths.every(Boolean)
      ? { paths, ...(leg.mode === 'STRAIGHT' ? { mode: 'STRAIGHT' } : {}) }
      : null;
  });

  if (!legs.every(Boolean)) return null;

  return { provider: 'google-transit', places: routeData.places, legs };
};

// 공유 저장 요청 검증 + 필요한 필드만 남기기
const sanitizePlan = ({ profile, itinerary, routesByDay } = {}) => {
  if (typeof profile?.travelerName !== 'string' || !profile.travelerName.trim()) return null;
  if (!Array.isArray(profile.days) || profile.days.length === 0 || profile.days.length > MAX_DAYS) return null;
  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) return null;

  const days = profile.days.map(({ key, label, date, displayDate } = {}) => ({ key, label, date, displayDate }));
  if (days.some((day) => typeof day.key !== 'string' || !day.key)) return null;

  const cleanItinerary = {};
  const cleanRoutesByDay = {};
  const safeRoutesByDay = routesByDay && typeof routesByDay === 'object' && !Array.isArray(routesByDay)
    ? routesByDay
    : {};

  for (const day of days) {
    const slots = itinerary[day.key] ?? [];
    const isValid = Array.isArray(slots)
      && slots.length <= MAX_PLACES_PER_DAY
      && slots.every(isValidSlot);
    if (!isValid) return null;
    cleanItinerary[day.key] = slots.map(sanitizeSlot);

    // routesByDay[day.key]는 프론트에서 { places, routeData } 형태로 저장되고,
    // 실제 경로 정보(provider/legs)는 그 안의 routeData에 있다.
    const dayRoute = safeRoutesByDay[day.key];
    const cleanRouteData = sanitizeRouteData(dayRoute?.routeData);
    if (cleanRouteData) {
      const dayRoutePlaces = Array.isArray(dayRoute.places) && dayRoute.places.every(isFinitePlace)
        ? dayRoute.places
        : cleanRouteData.places;
      cleanRoutesByDay[day.key] = { places: dayRoutePlaces, routeData: cleanRouteData };
    }
  }

  return {
    profile: {
      travelerName: profile.travelerName.trim().slice(0, 50),
      startDate: profile.startDate,
      endDate: profile.endDate,
      days,
    },
    itinerary: cleanItinerary,
    routesByDay: cleanRoutesByDay,
  };
};

const {
  NCP_MAP_CLIENT_ID,
  NCP_MAP_CLIENT_SECRET,
  API_HUB_CLIENT_ID,
  API_HUB_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY
} = process.env;

const decodePolyline = (encoded) => {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }

  return points;
};

// [수정됨] 일정 공유: 저장(POST)
app.post('/api/plans', async (req, res) => {
  try {
    const cleanPlan = sanitizePlan(req.body);

    if (!cleanPlan) {
      return res.status(400).json({ error: 'Invalid plan payload.' });
    }

    // 중복되지 않는 고유 ID 생성
    let id = createPlanId();
    let isUnique = false;
    while (!isUnique) {
      const existing = await Plan.findOne({ shareId: id });
      if (existing) {
        id = createPlanId();
      } else {
        isUnique = true;
      }
    }

    const now = new Date().toISOString();
    const finalPlanData = {
      id,
      ...cleanPlan,
      createdAt: now,
      updatedAt: now,
    };

    // DB에 저장
    const newPlan = new Plan({
      shareId: id,
      planData: finalPlanData
    });
    await newPlan.save();

    res.status(201).json({ id, plan: finalPlanData });
  } catch (error) {
    console.error('Plan save error:', error);
    res.status(500).json({ error: 'Plan Save Error' });
  }
});


app.get('/api/plans/:id', async (req, res) => {
  try {
    const planDoc = await Plan.findOne({ shareId: req.params.id });

    if (!planDoc) return res.status(404).json({ error: 'Plan not found.' });
    
    res.json(planDoc.planData);
  } catch (error) {
    console.error('Plan read error:', error);
    res.status(500).json({ error: 'Plan Read Error' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.get('https://naverapihub.apigw.ntruss.com/search/v1/local', {
      params: { query, display: 5 },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': API_HUB_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': API_HUB_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error('검색 API 에러:', details);
    res.status(status).json({ error: 'Search API Error', details });
  }
});

const EARTH_RADIUS_M = 6371000;
const toRadians = (deg) => (deg * Math.PI) / 180;

const haversineDistanceMeters = (a, b) => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const WALKABLE_DISTANCE_METERS = 1200; // 대략 도보 15분 이내. 이 안쪽은 네이버 driving, 바깥쪽은 Google TRANSIT 우선
const WALK_SPEED_MPS = 1.25;           // 직선 폴백 구간의 소요시간 추정용
const WALK_DETOUR_FACTOR = 1.3;        // 직선거리 → 실제 보행거리 보정
const ROUTE_REQUEST_TIMEOUT_MS = 10000; // 한쪽 API가 멈춰도 다음 폴백으로 넘어갈 수 있게 한다
const PATH_SIMPLIFY_TOLERANCE_METERS = 3;

// 네이버 Directions 5 (자동차 길찾기). Directions 15 를 구독 중이라면
// NAVER_DIRECTIONS_URL 에 https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving 을 지정한다.
const NAVER_DIRECTIONS_URL = process.env.NAVER_DIRECTIONS_URL
  || 'https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving';
const isNaverDirectionsConfigured = Boolean(NCP_MAP_CLIENT_ID && NCP_MAP_CLIENT_SECRET);
if (!isNaverDirectionsConfigured) {
  console.warn('NCP_MAP_CLIENT_ID / NCP_MAP_CLIENT_SECRET 이 없어 네이버 driving 경로를 건너뛰어요. (Google 대중교통 → 직선 순으로만 시도)');
}

const roundCoordinate = (value) => Math.round(value * 1e5) / 1e5;

// Douglas-Peucker 로 좌표 수를 줄인다(반복형이라 긴 경로에서도 안전).
// 네이버 driving 은 장거리 폴백일 때 형상점이 수천 개가 될 수 있어서,
// 그대로 두면 일정 공유 저장(express.json 1mb 제한)에서 걸릴 수 있다.
const simplifyPath = (points, toleranceMeters) => {
  if (points.length <= 2) return points;

  const refLatRad = toRadians(points[0].lat);
  const xs = points.map((point) => toRadians(point.lng) * Math.cos(refLatRad) * EARTH_RADIUS_M);
  const ys = points.map((point) => toRadians(point.lat) * EARTH_RADIUS_M);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const dx = xs[last] - xs[first];
    const dy = ys[last] - ys[first];
    const lengthSq = dx * dx + dy * dy;

    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const t = lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((xs[i] - xs[first]) * dx + (ys[i] - ys[first]) * dy) / lengthSq));
      const distance = Math.hypot(xs[i] - (xs[first] + t * dx), ys[i] - (ys[first] + t * dy));
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxIndex !== -1 && maxDistance > toleranceMeters) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
};

// ---------- Google Routes (대중교통) ----------
// - 경로가 없으면(빈 응답) null 을 돌려준다.
// - HTTP 에러(키/권한/쿼터 문제 등)는 throw 한다. (호출하는 쪽에서 폴백 처리)
// 한국은 Google 도보(WALK) 길찾기를 지원하지 않아 대중교통만 쓴다.
// 대중교통 응답의 steps 에는 역까지 걷는 도보 구간도 함께 들어 있다.
const computeGoogleTransitRoute = async (origin, destination) => {
  const response = await axios.post('https://routes.googleapis.com/directions/v2:computeRoutes', {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: 'TRANSIT',
    transitPreferences: {
      routingPreference: 'FEWER_TRANSFERS',
      allowedTravelModes: ['BUS', 'SUBWAY']
    }
  }, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.localizedValues,routes.legs.steps.polyline,routes.legs.steps.transitDetails'
    },
    timeout: ROUTE_REQUEST_TIMEOUT_MS
  });

  return response.data.routes?.[0] || null;
};

const googleErrorMessage = (error) => (
  error.response?.data?.error?.message || error.message
);

const formatTransitLeg = (origin, destination, route) => ({
  from: origin.title,
  to: destination.title,
  mode: 'TRANSIT',
  duration: route.duration,
  localizedValues: route.localizedValues,
  paths: (route.legs?.flatMap(leg => leg.steps || []) || [])
    .map(step => step.polyline?.encodedPolyline)
    .filter(Boolean)
    .map(decodePolyline),
  steps: route.legs?.flatMap(leg => leg.steps || []) || []
});

// ---------- 네이버 Directions (자동차 길찾기) ----------
// - 경로가 없으면(HTTP 200 + code !== 0: 출발/도착 동일, 도로 주변 아님 등) null 을 돌려준다.
// - HTTP 에러(인증/쿼터 등)는 throw 한다. (호출하는 쪽에서 폴백 처리)
const computeNaverDrivingRoute = async (origin, destination) => {
  const response = await axios.get(NAVER_DIRECTIONS_URL, {
    params: {
      start: `${origin.lng},${origin.lat}`, // 네이버는 (경도,위도) 순서
      goal: `${destination.lng},${destination.lat}`,
      option: 'traoptimal'
    },
    headers: {
      'X-NCP-APIGW-API-KEY-ID': NCP_MAP_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': NCP_MAP_CLIENT_SECRET,
    },
    timeout: ROUTE_REQUEST_TIMEOUT_MS
  });

  const { code, message, route } = response.data || {};
  if (code !== 0) {
    console.warn(`네이버 driving 경로 없음 (code ${code}): ${message || ''}`);
    return null;
  }
  return route?.traoptimal?.[0] || null;
};

const naverErrorMessage = (error) => {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message || error.message;
  return status ? `${status} ${message}` : message;
};

const formatNaverLeg = (origin, destination, route) => {
  const roadPoints = (route.path || [])
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([lng, lat]) => ({ lat, lng }));
  if (roadPoints.length === 0) return null;

  // 네이버는 출발/도착 좌표를 가까운 도로 위로 옮겨서 계산하므로, 실제 장소 마커까지
  // 선이 이어지도록 양 끝에 장소 좌표를 붙인다. (도로에서 마커까지 짧은 구간)
  const path = simplifyPath([
    { lat: origin.lat, lng: origin.lng },
    ...roadPoints,
    { lat: destination.lat, lng: destination.lng }
  ], PATH_SIMPLIFY_TOLERANCE_METERS)
    .map((point) => ({ lat: roundCoordinate(point.lat), lng: roundCoordinate(point.lng) }));

  return {
    from: origin.title,
    to: destination.title,
    mode: 'DRIVING',
    duration: `${Math.round((route.summary?.duration ?? 0) / 1000)}s`, // 자동차 기준 소요시간
    distanceMeters: route.summary?.distance ?? null,
    localizedValues: null,
    paths: [path],
    steps: []
  };
};

// ---------- 직선(최후의 수단) ----------
// 두 장소를 잇는 직선 구간. mode: 'STRAIGHT' 는 프론트에서 회색 점선으로 그려
// 실제 길이 아님을 구분한다.
const buildStraightLeg = (origin, destination) => {
  const meters = haversineDistanceMeters(origin, destination);
  const seconds = Math.round((meters * WALK_DETOUR_FACTOR) / WALK_SPEED_MPS);
  return {
    from: origin.title,
    to: destination.title,
    mode: 'STRAIGHT',
    duration: `${seconds}s`,
    localizedValues: null,
    paths: [[
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng }
    ]],
    steps: []
  };
};

// 각 시도는 성공하면 leg, 경로가 없거나 API 오류면 null 을 돌려준다.
// (오류는 서버 로그에 남기고, 호출하는 쪽에서 다음 수단으로 넘어간다)
const tryNaverDriving = async (origin, destination) => {
  if (!isNaverDirectionsConfigured) return null;
  try {
    const route = await computeNaverDrivingRoute(origin, destination);
    return route ? formatNaverLeg(origin, destination, route) : null;
  } catch (error) {
    console.warn(`네이버 driving 경로 실패 (${origin.title} -> ${destination.title}):`, naverErrorMessage(error));
    return null;
  }
};

const tryGoogleTransit = async (origin, destination) => {
  try {
    const route = await computeGoogleTransitRoute(origin, destination);
    const leg = route && formatTransitLeg(origin, destination, route);
    return leg && leg.paths.length > 0 ? leg : null;
  } catch (error) {
    console.warn(`Google 대중교통 경로 실패 (${origin.title} -> ${destination.title}):`, googleErrorMessage(error));
    return null;
  }
};

// 구간별 경로 선택:
//   거리 <= 1.2km : 네이버 driving(도보 대용) → Google TRANSIT → 직선
//   거리 >  1.2km : Google TRANSIT → 네이버 driving → 직선
const buildLeg = async (origin, destination) => {
  const isWalkable = haversineDistanceMeters(origin, destination) <= WALKABLE_DISTANCE_METERS;
  const attempts = isWalkable
    ? [tryNaverDriving, tryGoogleTransit]
    : [tryGoogleTransit, tryNaverDriving];

  for (const attempt of attempts) {
    const leg = await attempt(origin, destination);
    if (leg) return leg;
  }

  console.warn(`경로를 찾지 못해 직선 구간으로 대체 (${origin.title} -> ${destination.title})`);
  return buildStraightLeg(origin, destination);
};

// 사용자가 정한 방문 순서 그대로 구간별 경로를 만든다.
// provider 값은 저장된 공유 일정과의 호환을 위해 'google-transit' 을 그대로 쓴다.
// (실제 구간별 수단은 leg.mode: TRANSIT / DRIVING / STRAIGHT)
app.post('/api/transit', async (req, res) => {
  try {
    const { places } = req.body;

    if (
      !Array.isArray(places) || places.length < 2
      || !places.every((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng))
    ) {
      return res.status(400).json({ error: '좌표가 있는 장소가 2개 이상 필요해요.' });
    }

    const legs = [];
    for (let index = 0; index < places.length - 1; index += 1) {
      legs.push(await buildLeg(places[index], places[index + 1]));
    }

    res.json({ provider: 'google-transit', places, legs });
  } catch (error) {
    console.error('경로 API 에러:', error.response?.data || error.message);
    res.status(500).json({ error: `경로를 계산하지 못했어요: ${error.message}` });
  }
});

app.post('/api/place-details', async (req, res) => {
  try {
    const { title, address, lat, lng } = req.body;
    const hasCoordinates = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
    const response = await axios.post('https://places.googleapis.com/v1/places:searchText', {
      textQuery: `${title} ${address || ''}`.trim(),
      languageCode: 'ko',
      regionCode: 'KR',
      maxResultCount: 1,
      ...(hasCoordinates ? {
        locationBias: {
          circle: {
            center: { latitude: Number(lat), longitude: Number(lng) },
            radius: 10000
          }
        }
      } : {})
    }, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.primaryTypeDisplayName,places.priceLevel,places.photos.name'
      }
    });
  
    const place = response.data.places?.[0];
    if (!place) return res.json({});
  
    const photoName = place.photos?.[0]?.name;
    res.json({
      displayName: place.displayName?.text,
      formattedAddress: place.formattedAddress,
      googleMapsUri: place.googleMapsUri,
      nationalPhoneNumber: place.nationalPhoneNumber,
      primaryType: place.primaryTypeDisplayName?.text,
      priceLevel: place.priceLevel,
      photoUrl: photoName
        ? `/api/place-photo?name=${encodeURIComponent(photoName)}`
        : null
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error('Google 장소 API 에러:', details);
    res.status(status).json({ error: 'Place Details API Error', details });
  }
});

app.put('/api/plans/:id', async (req, res) => {
  try {
    const cleanPlan = sanitizePlan(req.body);
    if (!cleanPlan) {
      return res.status(400).json({ error: 'Invalid plan payload.' });
    }

    const shareId = req.params.id;
    const existingPlan = await Plan.findOne({ shareId });

    if (!existingPlan) {
      return res.status(404).json({ error: 'Plan not found.' });
    }

    const now = new Date().toISOString();
    const finalPlanData = {
      id: shareId,
      ...cleanPlan,
      createdAt: existingPlan.planData.createdAt,
      updatedAt: now,
    };

    existingPlan.planData = finalPlanData;
    await existingPlan.save();

    res.json({ id: shareId, plan: finalPlanData });
  } catch (error) {
    res.status(500).json({ error: 'Plan Update Error' });
  }
});
  
app.get('/api/place-photo', async (req, res) => {
  try {
    const photoName = String(req.query.name || '');
    if (!photoName.startsWith('places/')) return res.status(400).end();
  
    const response = await axios.get(`https://places.googleapis.com/v1/${photoName}/media`, {
      params: { maxWidthPx: 600 },
      headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY },
      responseType: 'stream'
    });
  
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);
  } catch (error) {
    console.error('Google 사진 API 에러:', error.response?.data || error.message);
    res.status(error.response?.status || 500).end();
  }
});

// 배포용: 빌드된 프론트(frontend/dist)를 같은 서버에서 서빙해요. (npm run build 후)
// /share/:id 같은 프론트 라우트는 index.html로 넘겨요. (Express 5는 '*' 패턴이 바뀌어서 미들웨어로 처리)
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy Server is running on http://localhost:${PORT}`);
});