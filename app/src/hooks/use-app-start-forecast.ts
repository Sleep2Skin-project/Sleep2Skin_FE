import type { SkinForecast } from '@/api/sleep';

// POST /sleep/sessions는 앱 시작마다 호출되고, 그 응답에 그날 피부 예보가 이미 실려 온다 — 스펙
// 자체가 "앱 시작 직후라면 GET /skin/forecast가 필요 없다. 여기는 이미 받은 예보를 날짜를 바꿔
// 다시 볼 때만 쓴다"고 명시한다. 그 호출은 _layout.tsx가 담당하고 그 결과를 그려야 하는 건
// index.tsx(홈)인데, 둘 사이에 (tabs) 스택이 껴 있어 props로 직접 못 내려준다.
//
// 이 한 번의 부트스트랩 값 때문에 Context/상태관리 라이브러리를 새로 두지 않고, 모듈 스코프
// 변수 하나로 "앱 시작 시 받은 예보"를 잠깐 들고 있다가 홈 화면이 마운트되며 한 번 꺼내 쓰고
// 비운다 — use-account-reset-signal.ts와 달리 "값이 바뀌면 재렌더"가 필요한 라이브 구독이 아니라
// 1회성 소비라 useSyncExternalStore도 필요 없다.
let cached: { sleepDate: string; forecast: SkinForecast } | null = null;

export function setAppStartForecast(sleepDate: string, forecast: SkinForecast) {
  cached = { sleepDate, forecast };
}

/**
 * baseDate와 sleepDate가 일치할 때만 값을 반환하고 즉시 비운다(consume) — 두 번째 홈 마운트(탭
 * 전환 등)에서 오래된 값을 재사용하면 안 되므로, 오직 "앱 시작 직후 첫 렌더"에서만 유효하다.
 * 값이 없거나 날짜가 다르면 null — 호출부는 이때 기존처럼 GET /skin/forecast로 폴백해야 한다.
 */
export function consumeAppStartForecast(baseDate: string): SkinForecast | null {
  if (!cached || cached.sleepDate !== baseDate) return null;
  const result = cached.forecast;
  cached = null;
  return result;
}
