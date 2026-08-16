// app/src/utils/format-time.ts
// ISO 8601 시각 문자열을 KST(Asia/Seoul) 벽시계 기준 "HH:mm"으로 안전하게 포맷한다.
//
// 백엔드 API마다 시각 오프셋 표기가 다르다 — api/sleep.ts는 "UTC('Z')", api/report.ts의
// 타임라인 필드는 "+09:00 오프셋 포함"으로 각각 문서화돼 있다. 예전엔 화면마다 "입력은 항상
// UTC"라고 가정하고 파싱 후 수동으로 9시간(9 * 60 * 60 * 1000ms)을 더하는 방식을 각자 구현했는데,
// 이 방식은 입력이 이미 +09:00 오프셋을 포함한 문자열이면 9시간이 이중으로 밀려버린다.
//
// JS의 Date는 문자열에 오프셋이 명시돼 있기만 하면('Z'든 '+09:00'이든) 항상 올바른 절대 시각으로
// 파싱한다 — 그래서 그 절대 시각에 수동으로 시간을 더하는 대신, Intl.DateTimeFormat의 timeZone
// 옵션으로 KST 벽시계 값을 직접 얻는다. 입력 문자열의 오프셋이 무엇이었든 항상 같은(올바른)
// 결과가 나온다.
const KST_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * ISO 8601 시각 문자열 → KST "HH:mm". null/undefined거나 파싱에 실패하면 fallback(기본값
 * '--:--')을 돌려줘 화면이 뻗지 않게 방어한다.
 */
export function formatTimeKST(iso: string | null | undefined, fallback = '--:--'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = KST_TIME_FORMATTER.formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!hour || !minute) return fallback;
  // 일부 엔진의 hour12:false 구현은 자정을 "24"로 반환한다 — "00"으로 정규화한다.
  return `${hour === '24' ? '00' : hour}:${minute}`;
}
