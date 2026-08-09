import { api } from "@/api/axios";

/**
 * 명세서 예시에 등장하는 3가지 수면 규격. 'UNSPECIFIED'는 임의 변형 금지.
 */
export type SleepStage = "AWAKE" | "UNSPECIFIED" | "DEEP";

export interface SleepSegment {
  stage: SleepStage;
  /** ISO 8601, 반드시 +09:00 오프셋 포함 (UTC 'Z' 변환 금지) */
  startTime: string;
  /** ISO 8601, 반드시 +09:00 오프셋 포함 (UTC 'Z' 변환 금지) */
  endTime: string;
}

export interface UploadSleepSessionRequest {
  segments: SleepSegment[];
  hrv: number;
  restingHeartRate: number;
}

export interface SleepStats {
  /** ISO 8601, UTC('Z') 형태로 내려옴 */
  sleepOnsetTime: string;
  /** ISO 8601, UTC('Z') 형태로 내려옴 */
  wakeTime: string;
  totalSleepMinutes: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  coreSleepMinutes: number;
  awakeCount: number;
  awakeMinutes: number;
}

/** 피부 예보 개별 지표 — 산출 가능한 경우에만 채워짐 */
export interface ForecastMetric {
  score: number;
  grade: string;
}

export type UnavailableForecastMetric = "DARK_CIRCLE" | "COMPLEXION" | "BARRIER";

export interface UnavailableForecastReason {
  metric: UnavailableForecastMetric;
  /** 예: "MISSING_FEATURES" — 그 외 값이 추가될 수 있어 string으로 유지 */
  reason: string;
}

export interface SkinForecast {
  darkCircle: ForecastMetric | null;
  complexion: ForecastMetric | null;
  barrier: ForecastMetric | null;
  unavailable: UnavailableForecastReason[];
}

export interface UploadSleepSessionData {
  processed: boolean;
  /** "YYYY-MM-DD" */
  sleepDate: string;
  sleep: SleepStats;
  forecast: SkinForecast;
}

export interface UploadSleepSessionResponse {
  success: boolean;
  data: UploadSleepSessionData;
}

export async function uploadSleepSession(
  data: UploadSleepSessionRequest,
  userId: number | string
): Promise<UploadSleepSessionResponse> {
  const response = await api.post<UploadSleepSessionResponse>(
    "/api/v1/sleep/sessions",
    data,
    {
      headers: {
        "X-User-Id": userId,
      },
    }
  );
  return response.data;
}

export type SleepInterpretationTone = "PRAISE" | "IMPROVE";

export interface SleepInterpretationFocus {
  /** 예: "AWAKE_COUNT" — 그 외 값이 추가될 수 있어 string으로 유지 */
  feature: string;
  label: string;
  score: number;
}

/** tone이 "PRAISE"면 칭찬만 하고 focus는 없다 */
export interface PraiseSleepInterpretation {
  tone: "PRAISE";
  headline: string;
  focus: null;
}

/** tone이 "IMPROVE"면 개선 포인트(focus)가 항상 존재한다 */
export interface ImproveSleepInterpretation {
  tone: "IMPROVE";
  headline: string;
  focus: SleepInterpretationFocus;
}

export type SleepInterpretation = PraiseSleepInterpretation | ImproveSleepInterpretation;

/** 데이터가 있는 경우 */
export interface AvailableSleepInterpretationData {
  status: "AVAILABLE";
  message: null;
  baseDate: string;
  interpretation: SleepInterpretation;
}

/** 수면 데이터가 없는 빈 상태 — 에러 아님, 200으로 내려온다 */
export interface NoSleepDataInterpretationData {
  status: "NO_SLEEP_DATA";
  message: string;
  baseDate: string;
  interpretation: null;
}

/**
 * `status` 필드로만 분기할 것. `message`의 유무나 내용으로 분기하지 말 것
 * (규칙: NO_SLEEP_DATA도 200 OK로 내려오며 에러가 아니다).
 */
export type SleepInterpretationData =
  | AvailableSleepInterpretationData
  | NoSleepDataInterpretationData;

export interface SleepInterpretationResponse {
  success: boolean;
  data: SleepInterpretationData;
}

export async function getSleepInterpretation(
  baseDate: string,
  userId: number
): Promise<SleepInterpretationResponse> {
  const response = await api.get<SleepInterpretationResponse>(
    "/api/v1/sleep/interpretation",
    {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    }
  );
  return response.data;
}
