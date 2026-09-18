// backend/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config(); // .env 파일에서 NAVER_CLIENT_ID, SECRET을 불러옵니다.

const app = express();

// 미들웨어 설정
app.use(cors()); // 프론트엔드에서 오는 요청 허용
app.use(express.json());

// 환경 변수에서 API Key 가져오기
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 1. 장소 검색 API 프록시 (Local 검색)
app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { 
        query, 
        display: 5 // 검색 결과 5개 출력
      },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('검색 API 에러:', error.response?.data || error.message);
    res.status(500).json({ error: 'Search API Error' });
  }
});

// 2. 동선(길찾기) API 프록시 (Directions 15 API 적용 완료)
app.post('/api/directions', async (req, res) => {
  try {
    const { start, goal, waypoints } = req.body;
    const response = await axios.get('https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving', {
      params: { start, goal, waypoints },
      headers: {
        'X-NCP-APIGW-API-KEY-ID': NAVER_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': NAVER_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('길찾기 API 에러:', error.response?.data || error.message);
    res.status(500).json({ error: 'Directions API Error' });
  }
});

// 포트 설정 (배포 환경에서는 process.env.PORT 사용, 로컬은 3001)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy Server is running on http://localhost:${PORT}`);
});