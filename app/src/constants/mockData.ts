// app/src/constants/mockData.ts
// 백엔드 API가 아직 없어 HOME 화면에서 쓰는 콘텐츠 데이터(날짜/인사말/피부예보 라벨)를 실제
// 응답과 유사한 형태(Object/JSON)로 분리해둔 목업. 레벨/exp, TODO 목록은 이미 실 API로
// 연동됐다(index.tsx, todo.tsx 참고) — LEVEL_EXP_MAX는 목업이 아니라 그 실 API 응답을
// 화면에 맞게 환산하는 데 쓰는 기획 확정 상수표다. 추후 API가 준비되면 나머지도 이 모듈에서
// 걷어낼 것.

// ── HOME (GET /home/summary 예상) ─────────────────────────────────────────
// sleepSummary.tooltipLines/skinForecast.items는 각각 GET /sleep/interpretation,
// GET /skin/forecast 실연동(index.tsx의 interpretationState/forecastState)으로 대체돼 더 이상
// 안 쓴다 — 여기 남기지 않는다. date/greeting/skinForecast.title·disclaimer만 대응하는 API가
// 없어 아직 이 목업을 쓴다.

export interface HomeSummaryResponse {
  date: {
    label: string;
  };
  greeting: {
    message: string;
    emoji: string;
  };
  skinForecast: {
    title: string;
    disclaimer: string;
  };
}

// 레벨업마다 필요 exp가 50씩 늘어나는 구조(기획 확정값): 레벨1=100, 레벨2=150, 레벨3=200,
// 레벨4=250, 레벨5=300 (= 100 + (레벨-1) * 50). MY 탭(my.tsx)의 레벨 구간 막대(EXP bar, "^" 표시가
// 레벨 경계)와 홈 화면(index.tsx)의 exp 진행률(getLevelExpDisplay) 둘 다 이 테이블로 GET
// /api/v1/users/me의 totalExp/nextLevelExp를 "이번 레벨 내 current/max" 형태로 환산한다.
export const LEVEL_EXP_MAX: Record<number, number> = {
  1: 100,
  2: 150,
  3: 200,
  4: 250,
  5: 300,
};

export const HOME_SUMMARY_MOCK: HomeSummaryResponse = {
  date: { label: '8월 6일 목요일' },
  greeting: { message: '좋은 아침이에요', emoji: '🌞' },
  skinForecast: {
    title: '오늘의 피부 예보',
    disclaimer: '예보는 확정이 아닌 위험 지수입니다. 식단·날씨·스킨케어도 함께 작용해요.',
  },
};

