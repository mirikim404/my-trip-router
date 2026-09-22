# My Trip Router 🗺️

나만의 맞춤형 여행 동선 최적화 플래너입니다. 가고 싶은 장소들을 담으면, 대중교통 소요시간을 기준으로 효율적인 방문 순서를 계산하고 네이버 지도 위에 실제 경로를 그려줍니다.

## 🤖 개발 방식

이 프로젝트는 아이디어 구상부터 구현과 수정까지 AI와 대화하며 진행한 바이브 코딩 프로젝트입니다. 생성된 코드와 설정은 프로젝트 목적에 맞게 계속 검토하고 개선하는 방식으로 작성했습니다.

## ✨ 주요 기능

- **장소 검색**: 네이버 Local API를 활용한 목적지 검색 및 추가
- **일정 관리**: Day 1, Day 2 등 일자별 장소 목록 관리 (로컬 스토리지 자동 저장)
- **동선 최적화**: 인접 장소까지의 대중교통 소요시간을 구글 Routes API로 계산해, 매 단계 가장 빨리 갈 수 있는 다음 장소를 선택하는 방식(Greedy Nearest)으로 방문 순서를 정렬
- **경로 시각화**: 구글 Routes API(대중교통)로 계산한 실제 경로를 네이버 지도 위에 표시
- **장소 상세정보**: 구글 Places API로 사진 · 전화번호 · 카테고리 등 부가 정보 연동
- **일정 공유**: 공유 링크(`/share/<id>`)로 친구가 로그인 없이 모바일에서 일정과 지도를 읽기 전용으로 확인

## 🛠️ 기술 스택

- **Frontend**: React(Vite), Axios
- **Backend (API Proxy)**: Node.js, Express, CORS
- **External API**: Naver Maps JavaScript API(지도 렌더링), Naver Local Search API(장소 검색), Google Routes API(대중교통 길찾기), Google Places API(장소 상세 · 사진)

> ℹ️ 예전에는 네이버 Directions 15(도로 기준) API로 경로를 그렸지만, 현재는 대중교통 기준(Google Routes API)으로 전환되어 있어요. 관련 레거시 코드는 `backend/server.js`의 `/api/directions`와 `frontend/src/components/MapViewer.jsx`의 `traoptimal` 분기, `frontend/src/utils/tspAlgo.js`에 남아 있고 현재는 어디서도 호출/사용하지 않습니다.

## 🚀 로컬 실행 방법

이 프로젝트는 브라우저 CORS 이슈를 방지하기 위해 프론트엔드와 프록시 서버(백엔드)를 모두 실행해야 합니다.

### 1. 환경 변수 설정

`backend/.env.example`을 복사해서 `backend/.env`를 만들고 값을 채웁니다.

```bash
cp backend/.env.example backend/.env
```

| 변수 | 필수 여부 | 용도 |
| --- | --- | --- |
| `API_HUB_CLIENT_ID` / `API_HUB_CLIENT_SECRET` | 필수 | 네이버 API HUB 지역 검색 (`/api/search`) |
| `GOOGLE_MAPS_API_KEY` | 필수 | 대중교통 길찾기, 장소 상세/사진 (`/api/transit`, `/api/place-details`, `/api/place-photo`) — Google Cloud Console에서 **Routes API**와 **Places API**를 모두 활성화한 키를 사용하세요 |
| `NCP_MAP_CLIENT_ID` / `NCP_MAP_CLIENT_SECRET` | 선택(레거시) | `/api/directions`(현재 프론트엔드에서 호출하지 않는 도로 길찾기 프록시)용. 안 채워도 앱 동작에는 영향 없어요 |
| `PORT` | 선택 | 백엔드 포트, 기본값 3001 |

지도(`index.html`)에 쓰이는 네이버 지도 JS 키는 NCP 콘솔에서 발급받아 `frontend/index.html`의 `ncpKeyId` 값을 본인 키로 교체하세요.

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
- **친구에게 임시로 보내기**: `cloudflared tunnel --url http://localhost:5173` 또는 `ngrok http 5173`으로 나온 주소로 접속해서 링크를 만들기 (그 주소가 링크에 들어가요) — 단, 이 방식은 **내 PC의 백엔드 프로세스가 켜져 있는 동안만** 링크가 열립니다
- **상시 배포**: `cd frontend && npm run build` 후 `cd backend && npm start` — 서버 하나가 화면(`frontend/dist`)과 `/api`를 함께 서빙해요. 내 컴퓨터를 꺼도 링크가 살아있게 하려면 이 방식을 Render/Railway/Fly.io 같은 상시 실행 호스팅에 올려야 해요
- **네이버 지도**: NCP 콘솔의 Web 서비스 URL에 접속 주소(내부 IP, 터널/배포 도메인)를 등록해야 지도가 표시돼요
- **Google API 키**: Google Cloud Console에서도 키에 대한 HTTP 리퍼러/도메인 제한을 배포 도메인으로 설정해두세요
- 선택 환경 변수(`frontend/.env`, `frontend/.env.example` 참고): `VITE_PUBLIC_BASE_URL`(공유 링크 기준 주소), `VITE_API_BASE_URL`(API를 다른 주소에 둘 때)

## ⚠️ 알려진 정리 대상 (Known Issues)

- `backend/server.js`의 `/api/directions`와 `frontend/src/components/MapViewer.jsx`의 `traoptimal` 분기: 사용하지 않는 레거시 코드
- `frontend/src/utils/tspAlgo.js`: 어디서도 import되지 않는 미사용 파일 (현재 최적화는 백엔드의 대중교통 소요시간 기준 로직이 담당)
- CORS가 모든 오리진에 열려있음 (`app.use(cors())`) — 배포 시 도메인 제한 필요
- `backend/data/plans.json`에 만료/정리 로직 없음 — 공유 링크가 계속 쌓임