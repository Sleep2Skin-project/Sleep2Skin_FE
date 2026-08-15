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
- [GET] `/api/v1/skin/model` (내 모델 — 일반 vs 개인화)
- [POST] `/api/v1/skin/selfie` (셀피 분석·검증·학습)
- [GET] `/api/v1/skin/verification/summary` (적중률·연속 검증 배너)
- [POST] `/api/v1/users/me/attendance` (출석 체크인 — HOME-04)
- [GET] `/api/v1/report/daily` (일간 리포트 — 수면 요약 + 피부 예보 전일 대비, REP-02/04/05)
- [GET] `/api/v1/report/daily/timeline` (일간 수면 타임라인 — 수면 단계 구간, REP-03)
- [GET] `/api/v1/report/monthly` (월간 리포트 — 주별 수면 점수/최고 주, 28일 요약, 수면-피부 상관관계, REP-07)
- [GET] `/api/v1/report/weekly` (주간 리포트 — 하루치 수면 점수 추이, 요약, 수면-피부 상관관계(실측 기준), REP-06)
- [GET] `/api/v1/todo` (오늘의 TODO 목록 — 오늘은 피하세요 + 오늘 밤 체크리스트, TODO-02~05)
- [PATCH] `/api/v1/todo/{id}` (TODO 항목 상태 변경 — 체크리스트 완료/되돌리기, exp 증감·회수, TODO-05)
- [GET] `/api/v1/users/me` (온보딩·동의 상태 + 프로필 조회 — 앱 진입 라우팅, MY 탭 레벨/exp/검증 횟수, ONB-01/MY-01)
- [DELETE] `/api/v1/users/me` (모든 기록 삭제 — 회원 탈퇴, hard delete, MY-04)
- [GET] `/api/v1/users/me/data-status` (수면 데이터 연결 상태 — 마지막 수신 시각, baseDate 없음, MY-02)

## 3. 🚨 Backend Developer Strict Rules (반드시 준수) 🚨
특히 `POST /api/v1/sleep/sessions` API 연동 시 아래 규칙을 무조건 따른다.
1. 수면 규격(타입) 3가지 중 'UNSPECIFIED'를 임의로 'CORE' 등으로 바꾸지 말 것. 프론트엔드에서도 문자열 `unspecified` 그대로 전송할 것.
2. 시간/시각 데이터를 보낼 때 반드시 오프셋을 포함하여 UTC 기준 `+09:00` 형태로 포맷팅해서 보낼 것. (예: `2026-08-09T21:18:26+09:00`)
3. Request Body에 `inBed` 필드는 절대 포함하지 말고 전송할 것.