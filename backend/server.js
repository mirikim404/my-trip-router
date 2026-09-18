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

app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display: 5 },
      headers: {
        'X-Naver-Client-Id': API_HUB_CLIENT_ID,
        'X-Naver-Client-Secret': API_HUB_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('검색 API 에러:', error.response?.data || error.message);
    res.status(500).json({ error: 'Search API Error' });
  }
});

app.post('/api/directions', async (req, res) => {
  try {
    const { start, goal, waypoints } = req.body;
    const response = await axios.get('https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving', {
      params: { start, goal, waypoints },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': NCP_MAP_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': NCP_MAP_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('길찾기 API 에러:', error.response?.data || error.message);
    res.status(500).json({ error: 'Directions API Error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy Server is running on http://localhost:${PORT}`);
});