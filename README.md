# My Trip Router 🗺️

나만의 맞춤형 여행 동선 최적화 플래너입니다. 가고 싶은 장소들을 담으면, 가장 효율적인 방문 순서(외판원 순회 알고리즘 적용)를 계산하여 네이버 지도 위에 최적의 경로를 그려줍니다.

## 🤖 개발 방식

이 프로젝트는 아이디어 구상부터 구현과 수정까지 AI와 대화하며 진행한 바이브 코딩 프로젝트입니다. 생성된 코드와 설정은 프로젝트 목적에 맞게 계속 검토하고 개선하는 방식으로 작성했습니다.

## ✨ 주요 기능
- **장소 검색**: 네이버 Local API를 활용한 목적지 검색 및 추가
- **일정 관리**: Day 1, Day 2 등 일자별 장소 목록 관리 (로컬 스토리지 자동 저장)
- **동선 최적화**: 선택한 장소들의 위경도를 분석하여 최단 거리 방문 순서 정렬 (Nearest Neighbor 알고리즘)
- **경로 시각화**: 네이버 Directions 5 API를 활용한 실제 도로 기준 길찾기 및 지도 렌더링
- **일정 공유**: 공유 링크(`/share/<id>`)로 친구가 로그인 없이 모바일에서 일정과 지도를 읽기 전용으로 확인

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

## 🔗 일정 공유하기

사이드바의 **공유 링크 만들기**를 누르면 일정이 백엔드(`backend/data/plans.json`)에 저장되고 `/share/<id>` 링크가 만들어집니다. 링크를 열면 로그인 없이 읽기 전용 화면이 열려요.

- **같은 Wi-Fi에서 확인**: PC의 내부 IP로 접속(`http://<PC-IP>:5173`)해서 링크를 만든 뒤 폰에서 열기
- **친구에게 임시로 보내기**: `cloudflared tunnel --url http://localhost:5173` 또는 `ngrok http 5173`으로 나온 주소로 접속해서 링크를 만들기 (그 주소가 링크에 들어가요)
- **배포**: `cd frontend && npm run build` 후 `cd backend && npm start` — 서버 하나가 화면(`frontend/dist`)과 `/api`를 함께 서빙해요
- **네이버 지도**: NCP 콘솔의 Web 서비스 URL에 접속 주소(내부 IP, 터널/배포 도메인)를 등록해야 지도가 표시돼요
- 선택 환경 변수(`frontend/.env`): `VITE_PUBLIC_BASE_URL`(공유 링크 기준 주소), `VITE_API_BASE_URL`(API를 다른 주소에 둘 때)
