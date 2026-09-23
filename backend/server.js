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
    return paths.every(Boolean) ? { paths } : null;
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

const WALKABLE_DISTANCE_METERS = 1200; // 대략 도보 15분 이내

const requestTransitRoute = async (origin, destination) => {
  const isWalkable = haversineDistanceMeters(origin, destination) <= WALKABLE_DISTANCE_METERS;

  const response = await axios.post('https://routes.googleapis.com/directions/v2:computeRoutes', {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: isWalkable ? 'WALK' : 'TRANSIT',
    ...(isWalkable ? {} : {
      transitPreferences: {
        routingPreference: 'FEWER_TRANSFERS',
        allowedTravelModes: ['BUS', 'SUBWAY']
      }
    })
  }, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.localizedValues,routes.legs.steps.polyline,routes.legs.steps.transitDetails'
    }
  });

  return response.data.routes?.[0] || null;
};

const durationInSeconds = (duration = '0s') => Number.parseFloat(duration.replace('s', ''));

const formatTransitLeg = (origin, destination, route) => ({
  from: origin.title,
  to: destination.title,
  duration: route.duration,
  localizedValues: route.localizedValues,
  paths: (route.legs?.flatMap(leg => leg.steps || []) || [])
    .map(step => step.polyline?.encodedPolyline)
    .filter(Boolean)
    .map(decodePolyline),
  steps: route.legs?.flatMap(leg => leg.steps || []) || []
});
  
app.post('/api/transit', async (req, res) => {
  try {
    const { places } = req.body;

    if (!Array.isArray(places) || places.length < 2) {
      return res.status(400).json({ error: 'At least two places are required.' });
    }

    const legs = [];

    for (let index = 0; index < places.length - 1; index += 1) {
      const origin = places[index];
      const destination = places[index + 1];

      try {
        const route = await requestTransitRoute(origin, destination);
        
        if (!route) {
          return res.status(422).json({ 
            error: `${origin.title}에서 ${destination.title}(으)로 가는 경로를 찾지 못했습니다.` 
          });
        }
        
        legs.push(formatTransitLeg(origin, destination, route));
      } catch (err) {
        console.error(`Route fetch error (${origin.title} -> ${destination.title}):`, err.message);
        return res.status(422).json({ 
          error: `${origin.title}에서 ${destination.title}(으)로 가는 경로 조회 중 오류가 발생했습니다.` 
        });
      }
    }

    res.json({ provider: 'google-transit', places, legs });
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error('대중교통 API 에러:', details);
    res.status(status).json({ error: 'Transit API Error', details });
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

app.post('/api/transit', async (req, res) => {
  try {
    const { places } = req.body;

    if (!Array.isArray(places) || places.length < 2) {
      return res.status(400).json({ error: 'At least two places are required.' });
    }

    const routeCache = new Map();
    const getRoute = async (origin, destination) => {
      const key = `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`;
      if (!routeCache.has(key)) routeCache.set(key, requestTransitRoute(origin, destination));
      return routeCache.get(key);
    };

    const orderedPlaces = [places[0]];
    const remainingPlaces = places.slice(1);

    while (remainingPlaces.length > 0) {
      const origin = orderedPlaces[orderedPlaces.length - 1];
      const candidates = await Promise.all(remainingPlaces.map(async place => ({
        place,
        route: await getRoute(origin, place).catch(() => null)
      })));
      const reachable = candidates.filter(candidate => candidate.route);

      if (reachable.length === 0) {
        return res.status(422).json({ error: `${origin.title}에서 남은 장소까지 대중교통 경로를 찾지 못했습니다.` });
      }

      reachable.sort((a, b) => (
        durationInSeconds(a.route.duration) - durationInSeconds(b.route.duration)
      ));
      const nextPlace = reachable[0].place;
      orderedPlaces.push(nextPlace);
      remainingPlaces.splice(remainingPlaces.indexOf(nextPlace), 1);
    }

    const legs = [];
    for (let index = 0; index < orderedPlaces.length - 1; index += 1) {
      const route = await getRoute(orderedPlaces[index], orderedPlaces[index + 1]);
      legs.push(formatTransitLeg(orderedPlaces[index], orderedPlaces[index + 1], route));
    }

    res.json({ provider: 'google-transit', places: orderedPlaces, legs });
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error('대중교통 API 에러:', details);
    res.status(status).json({ error: 'Transit API Error', details });
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