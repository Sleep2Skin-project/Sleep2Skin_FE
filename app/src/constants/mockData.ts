// app/src/constants/mockData.ts
// 백엔드 API가 아직 없어 HOME 화면에서 쓰는 콘텐츠 데이터(날짜/인사말/피부예보 라벨)를 실제
// 응답과 유사한 형태(Object/JSON)로 분리해둔 목업. 레벨/exp, TODO 목록은 이미 실 API로
// 연동됐다(index.tsx, todo.tsx 참고) — LEVEL_EXP_MAX는 목업이 아니라 그 실 API 응답을
// 화면에 맞게 환산하는 데 쓰는 기획 확정 상수표다. 추후 API가 준비되면 나머지도 이 모듈에서
// 걷어낼 것.

// ── HOME (GET /home/summary 예상) ─────────────────────────────────────────
// sleepSummary.tooltipLines/skinForecast.items는 각각 GET /sleep/interpretation,
// GET /skin/forecast 실연동(index.tsx의 interpretationState/forecastState)으로 대체돼 더 이상
// 안 쓴다 — 여기 남기지 않는다. greeting/skinForecast.title·disclaimer만 대응하는 API가 없어
// 아직 이 목업을 쓴다. date는 여기 있었지만(label: "8월 6일 목요일" 고정 문자열) 서버 API가
// 애초에 필요 없는 "오늘 날짜"를 목업으로 얼려두는 바람에 화면에 날짜가 영원히 안 바뀌는
// 버그였다 — index.tsx가 로컬에서 직접 계산하도록 고치면서 이 필드는 제거했다.

export interface HomeSummaryResponse {
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

// 레벨별 캐릭터 이미지 — 레벨4는 기존 figma-character.png와 픽셀 동일 이미지지만, 5종 모두
// 이 맵 하나로 통일해 관리한다. 홈 화면(index.tsx)과 마이 탭(my.tsx) 둘 다 GET
// /api/v1/users/me의 level로 이 맵에서 같은 이미지를 골라 쓴다 — 두 화면에 각자 하드코딩하면
// "레벨은 다른데 캐릭터 그림만 안 바뀌는" 어긋남이 생기기 쉬워 여기 하나로 모았다.
export const LEVEL_CHARACTER_IMAGES: Record<number, number> = {
  1: require('@/assets/images/figma-character-level-1.png'),
  2: require('@/assets/images/figma-character-level-2.png'),
  3: require('@/assets/images/figma-character-level-3.png'),
  4: require('@/assets/images/figma-character-level-4.png'),
  5: require('@/assets/images/figma-character-level-5.png'),
};

// 홈 화면(index.tsx) 캐릭터 박스 — 레벨별로 Figma 원본 PNG의 내부 여백이 서로 달라(레벨4용
// 박스를 5종 모두에 재사용하면 레벨2·3처럼 중앙이 안 맞았다), "홈 화면" 프레임 노드를 레벨별로
// 그대로 읽어 박스 좌표를 옮겼다: 레벨1(541:2704 "image 73"), 레벨2(541:2629 "image 49"),
// 레벨3(541:2706 "ghost2-transparent 1"), 레벨4(541:2747 "ghost3-nobg-shadow (1) 1"),
// 레벨5(541:2787 "image 45"). 402x874 캔버스 기준 절대 좌표.
//
// 🚨 top 값은 Figma 원본보다 일괄 40pt 작다 — index.tsx의 다른 요소들과 같은 이유(아이폰 16
// 실제 세로 여유 확보를 위해 캔버스 상단 여백을 줄이면서 전부 같이 위로 당김, index.tsx의
// SCALE_FIT_HEIGHT 주석 참고). 원래는 55pt였는데, 캐릭터와 말풍선 사이 거리를 좁혀달라는
// 피드백(docs/아이폰 16-7.jpg 후속)으로 캐릭터만 15pt 다시 내렸다(위쪽 다른 요소는 그대로
// 둠 — index.tsx dateGreetingBlock 주석 참고). left/width/height는 원본 그대로다.
export const LEVEL_CHARACTER_HOME_BOX: Record<number, { left: number; top: number; width: number; height: number }> = {
  1: { left: 32, top: 191, width: 329, height: 220 },
  2: { left: 89, top: 145, width: 205, height: 292 },
  3: { left: -8, top: 104, width: 348, height: 348 },
  4: { left: -14, top: 114, width: 367, height: 296 },
  5: { left: 30, top: 149, width: 293, height: 270 },
};

export const HOME_SUMMARY_MOCK: HomeSummaryResponse = {
  greeting: { message: '좋은 아침이에요', emoji: '🌞' },
  skinForecast: {
    title: '오늘의 피부 예보',
    disclaimer: '예보는 확정이 아닌 위험 지수입니다. 식단·날씨·스킨케어도 함께 작용해요.',
  },
};

