// 기본값은 같은 오리진('')이에요.
// - 개발: Vite 프록시(/api → 3001)가 백엔드로 넘겨줘요.
// - 배포: Express가 frontend/dist와 /api를 한 주소에서 같이 서빙해요.
// 프론트/백엔드를 다른 주소에 따로 배포할 때만 VITE_API_BASE_URL을 지정하세요.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// 공유 링크의 기준 주소. 로컬에서 만들어도 친구가 열 수 있는 공개 주소를 쓰고 싶을 때 지정하세요.
export const PUBLIC_BASE_URL = (import.meta.env.VITE_PUBLIC_BASE_URL || '').replace(/\/$/, '');

// 예전에 저장된 http://localhost:3001/api/place-photo?... 같은 주소도 현재 API 주소로 바꿔줘요.
export const resolveApiUrl = (url) => (
  url ? url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):3001(?=\/)/, API_BASE_URL) : url
);
