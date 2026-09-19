const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

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

// 1. 장소 검색 API 프록시 (NAVER API HUB - 지역 검색)
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

app.post('/api/directions', async (req, res) => {
  try {
    const { start, goal, waypoints } = req.body;
    const response = await axios.get('https://maps.apigw.ntruss.com/map-direction-15/v1/driving', {
      params: { start, goal, waypoints },
      headers: {
        'x-ncp-apigw-api-key-id': NCP_MAP_CLIENT_ID,
        'x-ncp-apigw-api-key': NCP_MAP_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error('길찾기 API 에러:', details);
    res.status(status).json({ error: 'Directions API Error', details });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy Server is running on http://localhost:${PORT}`);
});