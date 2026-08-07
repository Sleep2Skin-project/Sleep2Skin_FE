// app/src/constants/mockData.ts
// 백엔드 API가 아직 없어 HOME/TODO 화면에서 쓰는 콘텐츠 데이터를 실제 응답과 유사한
// 형태(Object/JSON)로 분리해둔 목업. 추후 API가 준비되면 이 모듈만 교체하면 된다.

// ── HOME (GET /home/summary 예상) ─────────────────────────────────────────

export type SkinRiskLevel = 'danger' | 'warning' | 'success';

export interface SkinForecastItem {
  key: string;
  label: string;
  value: number;
  status: string;
  riskLevel: SkinRiskLevel;
}

export interface HomeSummaryResponse {
  date: {
    label: string;
  };
  greeting: {
    message: string;
    emoji: string;
  };
  level: {
    current: number;
    progressPercent: number;
  };
  sleepSummary: {
    tooltipLines: string[];
  };
  skinForecast: {
    title: string;
    disclaimer: string;
    items: SkinForecastItem[];
  };
  verification: {
    summaryText: string;
  };
}

export const HOME_SUMMARY_MOCK: HomeSummaryResponse = {
  date: { label: '8월 6일 목요일' },
  greeting: { message: '좋은 아침이에요', emoji: '🌞' },
  level: { current: 3, progressPercent: (34 / 95.4) * 100 },
  sleepSummary: { tooltipLines: ['깊은 수면이', '32분 부족했어요'] },
  skinForecast: {
    title: '오늘의 피부 예보',
    disclaimer: '예보는 확정이 아닌 위험 지수입니다. 식단·날씨·스킨케어도 함께 작용해요.',
    items: [
      { key: 'oil', label: '유분', value: 78, status: '과다', riskLevel: 'warning' },
      { key: 'darkCircle', label: '다크서클', value: 41, status: '위험', riskLevel: 'danger' },
      { key: 'dullness', label: '칙칙함', value: 55, status: '보통', riskLevel: 'success' },
    ],
  },
  verification: { summaryText: '어제 예보 적중률 84% · 8일 연속 검증 중' },
};

// ── TODO (GET /todo/summary 예상) ──────────────────────────────────────────

export interface AvoidListItem {
  id: string;
  title: string;
  reason: string;
}

export interface ChecklistItemResponse {
  id: string;
  title: string;
  checked: boolean;
}

export interface TodoSummaryResponse {
  avoidList: AvoidListItem[];
  checklist: ChecklistItemResponse[];
}

export const TODO_SUMMARY_MOCK: TodoSummaryResponse = {
  avoidList: [
    { id: 'exfoliation', title: '강한 각질 제거', reason: '스크럽·AHA는 장벽이 회복된 뒤에' },
    { id: 'new-product', title: '새 제품 첫 사용', reason: '오늘은 반응을 예측하기 어려워요' },
  ],
  checklist: [
    { id: 'caffeine-cutoff', title: '카페인 컷오프 15:00', checked: false },
    { id: 'screen-off', title: '취침 30분 전 화면 끄기', checked: false },
    { id: 'room-temp', title: '침실 온도 19–21°C', checked: false },
    { id: 'lukewarm-cleanse', title: '미온수로 가벼운 세안', checked: false },
    { id: 'night-moisturizer', title: '취침 전 수분 크림 도포', checked: false },
    { id: 'dim-lights', title: '암막 커튼 및 조도 낮추기', checked: false },
  ],
};
