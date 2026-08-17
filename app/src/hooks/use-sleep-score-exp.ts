import { useSyncExternalStore } from 'react';

// "수면 점수가 전날보다 올랐음/오늘 90점 이상" exp 보상(SLEEP_SCORE_IMPROVED/SLEEP_SCORE_HIGH,
// POST /api/v1/sleep/sessions 응답)을 담는 최소 store. 이 값을 실제로 받아오는 API 호출은
// 스펙상 앱이 시작될 때마다 한 번 일어나야 해서 _layout.tsx가 소유하지만, 팝업(원래 시안
// 디자인)은 일간 리포트 화면을 처음 열었을 때 뜨는 게 맞다 — _layout.tsx는 그 화면의 부모가
// 아니라 조상이라(사이에 (tabs) 스택이 낌) props로 직접 못 내려주므로, use-account-reset-
// signal.ts와 동일한 이유로 useSyncExternalStore 기반 store를 둔다.
//
// _layout.tsx가 앱 시작 시 setSleepScoreExpResult로 값을 채우면, daily-report.tsx가
// useSleepScoreExpResult로 구독한다 — 데이터가 리포트 화면을 열기 전에 도착했든 연 뒤에
// 도착했든 상관없이(리포트 화면이 먼저 마운트돼도 나중에 값이 채워지면 그때 뜬다), "처음 한
// 번만" 보여준 뒤 consumeSleepScoreExpResult로 소비 처리해 재방문 시 다시 뜨지 않게 한다.
export interface SleepScoreExpResult {
  /** "YYYY-MM-DD" — 이 예보/점수가 어느 기상일 것인지. daily-report.tsx가 오늘 리포트일 때만 보여준다 */
  sleepDate: string;
  score: number;
  expGained: number;
}

let result: SleepScoreExpResult | null = null;
let consumed = false;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function setSleepScoreExpResult(next: SleepScoreExpResult) {
  result = next;
  consumed = false;
  emitChange();
}

/** MY-04(회원 탈퇴) 등으로 세션을 초기화할 때 이전 사용자의 값이 새 사용자에게 새어나가지 않게 비운다. */
export function resetSleepScoreExpResult() {
  result = null;
  consumed = false;
  emitChange();
}

/** 팝업을 닫을 때 호출 — 소비 처리해 같은 값으로 다시 뜨지 않게 한다. */
export function consumeSleepScoreExpResult() {
  consumed = true;
  emitChange();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return consumed ? null : result;
}

/** 아직 소비되지 않은 값이 있으면 그대로, 없거나 이미 닫았으면 null. */
export function useSleepScoreExpResult(): SleepScoreExpResult | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
