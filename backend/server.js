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

// 공유 저장 요청 검증 + 필요한 필드만 남기기
const sanitizePlan = ({ profile, itinerary } = {}) => {
  if (typeof profile?.travelerName !== 'string' || !profile.travelerName.trim()) return null;
  if (!Array.isArray(profile.days) || profile.days.length === 0 || profile.days.length > MAX_DAYS) return null;
  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) return null;

  const days = profile.days.map(({ key, label, date, displayDate } = {}) => ({ key, label, date, displayDate }));
  if (days.some((day) => typeof day.key !== 'string' || !day.key)) return null;

  const cleanItinerary = {};
  for (const day of days) {
    const places = itinerary[day.key] ?? [];
    const isValid = Array.isArray(places)
      && places.length <= MAX_PLACES_PER_DAY
      && places.every((place) => (
        typeof place?.title === 'string' && Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ));
    if (!isValid) return null;
    cleanItinerary[day.key] = places;
  }

  return {
    profile: {
      travelerName: profile.travelerName.trim().slice(0, 50),
      startDate: profile.startDate,
      endDate: profile.endDate,
      days,
    },
    itinerary: cleanItinerary,
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

// [수정됨] 일정 공유: 조회(GET)
app.get('/api/plans/:id', async (req, res) => {
  try {
    const planDoc = await Plan.findOne({ shareId: req.params.id });

    if (!planDoc) return res.status(404).json({ error: 'Plan not found.' });
    
    // DB에서 찾은 실제 일정 데이터 반환
    res.json(planDoc.planData);
  } catch (error) {
    console.error('Plan read error:', error);
    res.status(500).json({ error: 'Plan Read Error' });
  }
});

// 장소 검색 API 프록시 (NAVER API HUB - 지역 검색)
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

const requestTransitRoute = async (origin, destination) => {
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