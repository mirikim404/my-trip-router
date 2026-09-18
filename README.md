# My Trip Router 🗺️

나만의 맞춤형 여행 동선 최적화 플래너입니다. 가고 싶은 장소들을 담으면, 가장 효율적인 방문 순서(외판원 순회 알고리즘 적용)를 계산하여 네이버 지도 위에 최적의 경로를 그려줍니다.

## 🤖 개발 방식

이 프로젝트는 아이디어 구상부터 구현과 수정까지 AI와 대화하며 진행한 바이브 코딩 프로젝트입니다. 생성된 코드와 설정은 프로젝트 목적에 맞게 계속 검토하고 개선하는 방식으로 작성했습니다.

## ✨ 주요 기능
- **장소 검색**: 네이버 Local API를 활용한 목적지 검색 및 추가
- **일정 관리**: Day 1, Day 2 등 일자별 장소 목록 관리 (로컬 스토리지 자동 저장)
- **동선 최적화**: 선택한 장소들의 위경도를 분석하여 최단 거리 방문 순서 정렬 (Nearest Neighbor 알고리즘)
- **경로 시각화**: 네이버 Directions 5 API를 활용한 실제 도로 기준 길찾기 및 지도 렌더링

## 🛠️ 기술 스택
- **Frontend**: React(Vite), Axios
- **Backend (API Proxy)**: Node.js, Express, CORS
- **External API**: Naver Maps JavaScript API, Naver Local Search API, Naver Directions 5 API

## 🚀 로컬 실행 방법

이 프로젝트는 브라우저 CORS 이슈를 방지하기 위해 프론트엔드와 프록시 서버(백엔드)를 모두 실행해야 합니다.

### 1. 환경 변수 설정
`backend` 폴더 최상단에 `.env` 파일을 생성하고 네이버 클라우드 플랫폼에서 발급받은 API 키를 입력합니다.

```env
NAVER_CLIENT_ID=여러분의_클라이언트_ID
NAVER_CLIENT_SECRET=여러분의_클라이언트_시크릿
```

### 2. 패키지 설치
프론트엔드와 백엔드 각각 패키지를 설치합니다.

```bash
# 터미널 1: 프론트엔드 설치 및 실행
cd frontend
npm install
npm run dev

# 터미널 2: 백엔드(프록시 서버) 설치 및 실행
cd backend
npm install
node server.js
```

### 3. 접속
브라우저에서 `http://localhost:5173` (Vite 기본 포트)로 접속하여 앱을 이용합니다.