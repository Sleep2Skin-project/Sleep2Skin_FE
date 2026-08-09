# Sleep2Skin Frontend API Specification & Rules

## 1. Base Configuration
- **Base URL:** `https://sleep2skin.duckdns.org`
- **통신 라이브러리:** `axios` (또는 fetch)를 사용하여 중앙 집중형 API 클라이언트(예: `src/api/axios.ts` 또는 `api.js`)를 구성할 것.

## 2. API Endpoints Catalog (현재 활성화된 API)
- [GET] `/api/v1/health` (헬스체크)
- [GET] `/api/v1/skin/forecast` (오늘의 피부 예보 조회)
- [GET] `/api/v1/sleep/interpretation` (어젯밤 수면 통역 카드)
- [POST] `/api/v1/sleep/sessions` (수면 세션 업로드)
- [POST] `/api/v1/users/me/consents` (개인정보 수집/이용 동의)
- [PATCH] `/api/v1/users/me/onboarding` (온보딩 완료 처리)

## 3. 🚨 Backend Developer Strict Rules (반드시 준수) 🚨
특히 `POST /api/v1/sleep/sessions` API 연동 시 아래 규칙을 무조건 따른다.
1. 수면 규격(타입) 3가지 중 'UNSPECIFIED'를 임의로 'CORE' 등으로 바꾸지 말 것. 프론트엔드에서도 문자열 `unspecified` 그대로 전송할 것.
2. 시간/시각 데이터를 보낼 때 반드시 오프셋을 포함하여 UTC 기준 `+09:00` 형태로 포맷팅해서 보낼 것. (예: `2026-08-09T21:18:26+09:00`)
3. Request Body에 `inBed` 필드는 절대 포함하지 말고 전송할 것.