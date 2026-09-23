const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB 연결 성공!'))
  .catch((err) => console.error('MongoDB 연결 실패:', err));

const planSchema = new mongoose.Schema({
  shareId: { type: String, required: true, unique: true },
  planData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Plan = mongoose.model('Plan', planSchema);

const createPlanId = () => crypto.randomBytes(5).toString('base64url');

const MAX_DAYS = 31;
const MAX_PLACES_PER_DAY = 50;

const isFinitePlace = (place) => (
  place && typeof place === 'object'
  && typeof place.title === 'string'
  && Number.isFinite(place.lat) && Number.isFinite(place.lng)
);

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

const sanitizePlan = ({ profile, itinerary } = {}) => {
  if (typeof profile?.travelerName !== 'string' || !profile.travelerName.trim()) return null;
  if (!Array.isArray(profile.days) || profile.days.length === 0 || profile.days.length > MAX_DAYS) return null;
  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) return null;

  const days = profile.days.map(({ key, label, date, displayDate } = {}) => ({ key, label, date, displayDate }));
  if (days.some((day) => typeof day.key !== 'string' || !day.key)) return null;

  const cleanItinerary = {};

  for (const day of days) {
    const slots = itinerary[day.key] ?? [];
    const isValid = Array.isArray(slots)
      && slots.length <= MAX_PLACES_PER_DAY
      && slots.every(isValidSlot);
    if (!isValid) return null;
    cleanItinerary[day.key] = slots.map(sanitizeSlot);
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

app.post('/api/plans', async (req, res) => {
  try {
    const cleanPlan = sanitizePlan(req.body);

    if (!cleanPlan) {
      return res.status(400).json({ error: 'Invalid plan payload.' });
    }

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