const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const {
  NCP_MAP_CLIENT_ID,
  NCP_MAP_CLIENT_SECRET,
  API_HUB_CLIENT_ID,
  API_HUB_CLIENT_SECRET
} = process.env;

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

// 2. 길찾기(동선) API 프록시 (Maps 상품 - Directions 15)
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