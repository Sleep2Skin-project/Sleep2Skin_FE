import {
  requestAuthorization,
  queryCategorySamples,
  queryQuantitySamples,
  CategoryValueSleepAnalysis,
} from "@kingstinct/react-native-healthkit";

const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const HRV_TYPE = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const RESTING_HR_TYPE = "HKQuantityTypeIdentifierRestingHeartRate";

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

export async function getSleepData(): Promise<any[]> {
  const allSamples = await queryCategorySamples(SLEEP_TYPE, { limit: 0 });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSamples = allSamples.filter((sample: any) => {
    const sampleTime = new Date(sample.startDate).getTime();
    return sampleTime >= sevenDaysAgo;
  });

  return recentSamples;
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

const SLEEP_SESSION_UPLOAD_URL =
  "https://sleep2skin.duckdns.org/api/v1/sleep/sessions";

type SleepStage = "AWAKE" | "CORE" | "DEEP" | "REM" | "UNSPECIFIED";

type SleepSessionSegment = {
  stage: SleepStage;
  startTime: string;
  endTime: string;
};

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
export function mapSleepSamplesToSegments(rawSamples: any[]): SleepSessionSegment[] {
  const segments: SleepSessionSegment[] = [];

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

  return segments;
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
// POST /api/v1/sleep/sessions로 업로드한다. 실패해도 예외를 밖으로 던지지 않는다.
export async function uploadSleepSession(): Promise<void> {
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
      return;
    }

    const requestBody: {
      segments: SleepSessionSegment[];
      hrv?: number;
      restingHeartRate?: number;
    } = { segments };

    if (hrv !== undefined) {
      requestBody.hrv = hrv;
    }

    if (restingHeartRate !== undefined) {
      requestBody.restingHeartRate = restingHeartRate;
    }

    const response = await fetch(SLEEP_SESSION_UPLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "1",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    if (result.success) {
      console.log("✅ 수면 세션 업로드 성공:", result.data);
    } else {
      console.log(
        "❌ 수면 세션 업로드 실패:",
        result.error?.code,
        result.error?.message,
      );
    }
  } catch (error) {
    console.log("❌ 수면 세션 업로드 중 네트워크 에러:", error);
  }
}
