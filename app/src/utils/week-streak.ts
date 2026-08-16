// app/src/utils/week-streak.ts
// "지금 이어지는 연속 검증 스트릭(streakCount)"을 이번 주(월~일) 요일 그리드에 투영하는 공용
// 계산 — 마이 탭의 "이번 주 출석 스트릭"(my.tsx)과 출석 체크인 팝업(attendance-flow.tsx)이
// 둘 다 쓴다.
//
// 듀오링고 스트릭과 같은 개념이다: 정확한 과거 요일별 출석 이력을 서버가 내려주는 게 아니라
// (그런 API가 없음, GET /skin/verification/summary·GET /users/me는 streakCount 정수 하나뿐),
// "오늘 포함 최근 streakCount일이 연속"이라는 사실만으로 이번 주 달력 위에 꼬리를 그리는 것이다.
// 스트릭이 이번 주 시작 전부터 이어졌으면 월요일부터 전부 완료로 보이고, 스트릭이 짧으면
// 앞쪽 요일은 미완료로 보인다 — 주 중간에 스트릭이 끊겼다 다시 시작됐다면 끊기기 전에 완료했던
// 날도 미완료로 보일 수 있는데, 이는 "스트릭"이라는 개념 자체가 끊기면 리셋되는 것이라 정상이다.

/** JS Date.getDay()(0=일요일 시작)을 월요일 시작 인덱스(0=월 ... 6=일)로 변환한다. */
export function toMondayFirstWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * weekdayIndex(0=월...6=일)가 "오늘(todayIndex) 포함 최근 streakCount일" 안에 드는지 판단한다.
 * 오늘 이후(미래) 요일은 항상 false.
 */
export function isWeekdayInTrailingStreak(weekdayIndex: number, todayIndex: number, streakCount: number): boolean {
  if (weekdayIndex > todayIndex) return false;
  const daysBeforeToday = todayIndex - weekdayIndex;
  return daysBeforeToday < streakCount;
}
