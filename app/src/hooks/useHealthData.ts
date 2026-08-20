import {
  requestAuthorization,
  queryCategorySamples,
  queryQuantitySamples,
  CategoryValueSleepAnalysis,
} from "@kingstinct/react-native-healthkit";

import {
  uploadSleepSession as postSleepSession,
  type SleepSegment,
  type SleepStage,
  type UploadSleepSessionData,
} from "@/api/sleep";
import { setAppStartForecast } from "@/hooks/use-app-start-forecast";
import { setSleepScoreExpResult } from "@/hooks/use-sleep-score-exp";

const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const HRV_TYPE = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const RESTING_HR_TYPE = "HKQuantityTypeIdentifierRestingHeartRate";

// 인접 수면 샘플 사이의 공백이 이 값 이상이면 서로 다른 밤(세션)으로 본다. HealthKit은
// "낮 동안 안 잠"을 별도 샘플로 주지 않고 그냥 샘플이 없는 공백으로만 남기므로, 세션 경계는
// 이 공백으로 판단할 수밖에 없다. 짧은 재취침/낮잠까지 별도 세션으로 쪼개지지 않도록
// 일반적인 낮 활동 시간대(3시간 이상 연속 비수면)를 기준으로 잡았다.
const SESSION_GAP_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export async function initHealthKit(): Promise<string> {
  try {
    await requestAuthorization({
      toRead: [SLEEP_TYPE, HRV_TYPE, RESTING_HR_TYPE],
    });
    return "";
  } catch (error: any) {
    console.log("[HealthKit] 권한 요청 실패:", error);
    return error?.message ?? "권한 요청 실패";
  }
}

// 시간순으로 정렬된 수면 샘플을 인접 샘플 간 공백(gap) 기준으로 밤 단위 세션으로 나누고,
// 가장 최근 세션(마지막 클러스터)의 샘플만 반환한다. 여러 소스(Watch/iPhone 수동 입력)가
// 겹치는 구간을 가질 수 있어 "지금까지 본 최대 endDate"를 기준으로 공백을 계산한다.
function getMostRecentSleepSession(samples: any[]): any[] {
  if (samples.length === 0) {
    return [];
  }

  const sorted = [...samples].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  let sessionStartIndex = 0;
  let maxEndSoFar = new Date(sorted[0].endDate).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const currentStart = new Date(sorted[i].startDate).getTime();
    const currentEnd = new Date(sorted[i].endDate).getTime();

    if (currentStart - maxEndSoFar >= SESSION_GAP_THRESHOLD_MS) {
      sessionStartIndex = i;
      maxEndSoFar = currentEnd;
    } else {
      maxEndSoFar = Math.max(maxEndSoFar, currentEnd);
    }
  }

  return sorted.slice(sessionStartIndex);
}

export async function getSleepData(): Promise<any[]> {
  const allSamples = await queryCategorySamples(SLEEP_TYPE, { limit: 0 });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSamples = allSamples.filter((sample: any) => {
    const sampleTime = new Date(sample.startDate).getTime();
    return sampleTime >= sevenDaysAgo;
  });

  return getMostRecentSleepSession(recentSamples);
}

export async function getHrvData(): Promise<any[]> {
  const allSamples = await queryQuantitySamples(HRV_TYPE, { limit: 0 });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSamples = allSamples.filter((sample: any) => {
    const sampleTime = new Date(sample.startDate).getTime();
    return sampleTime >= sevenDaysAgo;
  });

  return recentSamples;
}

export async function getRestingHeartRateData(): Promise<any[]> {
  const allSamples = await queryQuantitySamples(RESTING_HR_TYPE, { limit: 0 });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSamples = allSamples.filter((sample: any) => {
    const sampleTime = new Date(sample.startDate).getTime();
    return sampleTime >= sevenDaysAgo;
  });

  return recentSamples;
}

// HKCategoryValueSleepAnalysis(inBed=0, asleepUnspecified=1(=asleep), awake=2, asleepCore=3,
// asleepDeep=4, asleepREM=5) → 백엔드 stage. inBed은 매핑표에 없으므로 아래에서 별도로 걸러낸다.
const SLEEP_STAGE_MAP: Record<number, SleepStage> = {
  [CategoryValueSleepAnalysis.asleepUnspecified]: "UNSPECIFIED",
  [CategoryValueSleepAnalysis.awake]: "AWAKE",
  [CategoryValueSleepAnalysis.asleepCore]: "CORE",
  [CategoryValueSleepAnalysis.asleepDeep]: "DEEP",
  [CategoryValueSleepAnalysis.asleepREM]: "REM",
};

// Date를 타임존 오프셋 포함 ISO 8601(예: 2026-08-06T23:40:00+09:00)로 변환한다.
// Date#toISOString()은 항상 UTC("Z")로 고정되어 서버가 요구하는 오프셋 포함 형식과 맞지 않는다.
function formatIsoWithOffset(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetMins = pad(Math.abs(offsetMinutes) % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMins}`;
}

// HealthKit 수면 원시 샘플(getSleepData 반환값)을 백엔드 sleep/sessions API의 segments 형식으로 변환한다.
// "in bed"(수면이 아니라 침대에 누워있기만 한 구간)는 결과에서 완전히 제외하고,
// UNSPECIFIED는 임의로 다른 stage로 바꾸지 않고 그대로 전달한다.
export function mapSleepSamplesToSegments(rawSamples: any[]): SleepSegment[] {
  const segments: SleepSegment[] = [];

  for (const sample of rawSamples) {
    const value = sample.value;

    if (value === CategoryValueSleepAnalysis.inBed) {
      continue;
    }

    const stage = SLEEP_STAGE_MAP[value];
    if (!stage) {
      console.warn("⚠️ 알 수 없는 수면 단계 값:", value);
      continue;
    }

    segments.push({
      stage,
      startTime: formatIsoWithOffset(new Date(sample.startDate)),
      endTime: formatIsoWithOffset(new Date(sample.endDate)),
    });
  }

  segments.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return trimOverlappingSegments(segments);
}

// 여러 소스(Watch/iPhone 수동 입력 등)나 수동 편집 오차로 인접 구간이 몇 분씩 겹칠 수 있다.
// 뒤 구간의 시작을 앞 구간의 끝으로 잘라 붙여서 겹침을 없앤다(데이터 유실 최소화 — 뒤 구간을
// 통째로 버리지 않음). 자른 결과 시작이 끝과 같거나 더 뒤로 밀리면(앞 구간에 완전히 포함된
// 경우) 그 구간은 버린다. segments는 startTime 오름차순 정렬이 되어 있어야 한다.
function trimOverlappingSegments(segments: SleepSegment[]): SleepSegment[] {
  const trimmed: SleepSegment[] = [];

  for (const segment of segments) {
    const prev = trimmed[trimmed.length - 1];

    if (!prev) {
      trimmed.push(segment);
      continue;
    }

    const prevEndMs = new Date(prev.endTime).getTime();
    const currentStartMs = new Date(segment.startTime).getTime();

    if (currentStartMs >= prevEndMs) {
      trimmed.push(segment);
      continue;
    }

    const currentEndMs = new Date(segment.endTime).getTime();
    if (currentEndMs <= prevEndMs) {
      continue;
    }

    trimmed.push({ ...segment, startTime: prev.endTime });
  }

  return trimmed;
}

function getMostRecentQuantity(samples: any[]): number | undefined {
  if (samples.length === 0) {
    return undefined;
  }

  const mostRecent = samples.reduce((latest, sample) =>
    new Date(sample.startDate).getTime() > new Date(latest.startDate).getTime()
      ? sample
      : latest,
  );

  return mostRecent.quantity;
}

// HealthKit에서 가져온 실제 수면/HRV/안정시 심박수 데이터를 백엔드 형식으로 변환해
// POST /api/v1/sleep/sessions로 업로드한다(api/sleep.ts의 타입 있는 클라이언트를 그대로 쓴다 —
// URL/헤더/에러 파싱을 이 파일에 다시 구현하지 않는다). 앱이 시작될 때마다 호출하는 것이 원칙이라
// (새 데이터가 없어도 그냥 호출 — 서버가 해시로 재처리 여부를 판단), 실패해도 예외를 밖으로
// 던지지 않고 null을 반환한다. 호출부는 응답을 직접 해석하지 말고 반드시 아래
// applySleepSessionUploadResult에 넘길 것 — 그 이유는 그 함수 주석 참고.
export async function uploadSleepSession(
  userId: number,
): Promise<UploadSleepSessionData | null> {
  try {
    const sleepSamples = await getSleepData();
    const segments = mapSleepSamplesToSegments(sleepSamples);

    const hrvSamples = await getHrvData();
    const hrv = getMostRecentQuantity(hrvSamples);
    if (hrv === undefined) {
      console.log("ℹ️ HRV 데이터가 없어 이번 업로드에서 제외합니다.");
    }

    const restingHrSamples = await getRestingHeartRateData();
    const restingHeartRate = getMostRecentQuantity(restingHrSamples);
    if (restingHeartRate === undefined) {
      console.log("ℹ️ 안정시 심박수 데이터가 없어 이번 업로드에서 제외합니다.");
    }

    if (segments.length === 0) {
      console.log("업로드할 수면 데이터가 없습니다");
      return null;
    }

    const { data } = await postSleepSession({ segments, hrv, restingHeartRate }, userId);

    console.log("✅ 수면 세션 업로드 성공:", data);
    return data;
  } catch (error) {
    console.log("❌ 수면 세션 업로드 실패:", error);
    return null;
  }
}

// uploadSleepSession은 두 곳에서 각각 독립적으로 호출된다 — 온보딩(onboarding-flow.tsx,
// ONB-03 "건강 앱 연동하기")이 최초 1회, 그리고 앱이 켜질 때마다(_layout.tsx) 매번. 신규
// 유저가 막 온보딩을 마치면 이 두 호출이 거의 동시에 일어난다: 온보딩의 호출이 먼저 서버에
// 도달해 processed:true로 정상 처리되고, 그 직후 온보딩 완료로 pastOnboarding이 true가 되며
// 발동하는 _layout.tsx의 호출은 "방금 그 데이터"라 서버가 processed:false·exp:[]로 되돌려준다
// (반대 순서로 도착해도 결과만 바뀔 뿐 원리는 같다) — 즉 둘 중 정확히 어느 쪽이 진짜 처리된
// 응답을 받을지는 매번 다르다. 예전엔 _layout.tsx만 이 응답으로 exp 팝업 store를 채웠는데,
// 그러면 온보딩 직후엔 항상 두 번째(중복) 호출만 보게 되어 팝업이 구조적으로 뜰 수 없었다.
// 그래서 양쪽 호출부 모두 자기 응답을 직접 해석하지 않고 이 함수에 그대로 넘기게 해서, 실제로
// processed:true를 받은 쪽이 어디든 그쪽에서 팝업/예보 캐시가 채워지도록 한다(반대쪽은 exp가
// 비어 있어 자연히 아무 일도 안 한다 — 중복 호출 자체를 막을 필요는 없다, 서버가 이미 멱등하게
// 설계돼 있다).
export function applySleepSessionUploadResult(data: UploadSleepSessionData | null) {
  if (!data) return;

  // 예보는 processed 여부·sleepScore null 여부와 무관하게 항상 실려 온다 — 홈 화면(index.tsx)이
  // 같은 걸 GET /skin/forecast로 또 조회하지 않도록 캐시해둔다(use-app-start-forecast.ts 참고).
  setAppStartForecast(data.sleepDate, data.forecast);

  if (data.sleep.sleepScore === null) return;

  // 이 API가 지급하는 reason은 SLEEP_SCORE_IMPROVED/SLEEP_SCORE_HIGH 둘뿐이지만, 다른 reason이
  // 섞여 와도 이 팝업은 "수면 점수" 사유분만 더해서 보여준다.
  const sleepScoreExpGained = data.exp.reasons
    .filter((reason) => reason.reason.startsWith('SLEEP_SCORE'))
    .reduce((sum, reason) => sum + reason.amount, 0);
  if (sleepScoreExpGained <= 0) return;

  setSleepScoreExpResult({
    sleepDate: data.sleepDate,
    score: data.sleep.sleepScore,
    expGained: sleepScoreExpGained,
  });
}
