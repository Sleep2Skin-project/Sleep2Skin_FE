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
1. 수면 규격(타입) 5가지(`AWAKE`/`UNSPECIFIED`/`CORE`/`DEEP`/`REM`) 중 `UNSPECIFIED`를 임의로 `CORE` 등으로 바꾸지 말 것. 대문자 그대로("UNSPECIFIED") 전송할 것 — 바꾸면 서버 비율 분모가 오염돼 장벽 점수만 조용히 틀린다.
2. 시간/시각 데이터를 보낼 때 반드시 오프셋을 포함하여 UTC 기준 `+09:00` 형태로 포맷팅해서 보낼 것. (예: `2026-08-09T21:18:26+09:00`) 오프셋이 없으면 역직렬화가 실패해 400이 난다.
3. Request Body에 `inBed` 필드는 절대 포함하지 말고 전송할 것. (보내도 서버가 무시함)
4. `baseDate`는 보내지 않는다 — 서버가 기상 시각의 날짜로 결정한다.
5. 집계값(총 수면·단계별 분·각성 횟수)은 절대 보내지 않는다 — segments만 보내면 서버가 첫 기상에서 세션을 잘라 집계한다.

### 3-1. 앱 시작마다 호출 (`src/app/_layout.tsx`)
`POST /api/v1/sleep/sessions`는 앱이 시작될 때마다 호출한다(HOME-04 출석 체크인과 같은 타이밍). 새 수면 데이터가 없어도 그냥 호출하면 되며, 서버가 정규화 해시로 같은 수면인지 판별해 재처리를 건너뛴다 — 호출 전에 "새 데이터가 있는지"를 앱이 미리 판단하지 않는다.

### 3-2. 수면 점수 exp 보상 (HOME-04)
응답의 `exp` 필드로 아래 두 보상이 지급된다(동시에 실릴 수 있음, `api/game.ts`의 `AttendanceExpInfo` 타입을 재사용):

| reason | 조건 | 양 |
|---|---|---|
| `SLEEP_SCORE_IMPROVED` | 전날 수면 점수보다 올랐음 | (오늘 − 어제) × 2 |
| `SLEEP_SCORE_HIGH` | 오늘 수면 점수 90점 이상 | +10 |

- `processed: false`(같은 데이터 재수신)면 `exp.gained: 0`·`reasons: []`. 앱이 앱을 다섯 번 켜도 다섯 번 지급되지 않는 이유가 이것 — 절대 프론트에서 별도로 "오늘 이미 받았는지" 캐싱하지 않는다.
- `exp.gained`의 부호를 그대로 반영할 것. 양수로 가정하고 더하면 서버가 막은 무한 적립이 화면에서 되살아난다.
- `sleep.sleepScore`는 참여 피처가 0개인 날 `null`(0점이 아님) — `null`이면 팝업을 띄우지 않는다.
- 실제 연동: `src/hooks/useHealthData.ts`의 `uploadSleepSession(userId)`가 HealthKit 원시 데이터를 모아 `src/api/sleep.ts`의 타입 있는 클라이언트로 전송하고, `src/app/_layout.tsx`가 그 응답의 `exp`를 읽어 `SleepScoreGamificationModal`을 띄운다(출석 팝업이 끝난 뒤에만).