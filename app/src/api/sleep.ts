import { AxiosError } from "axios";

import { api } from "@/api/axios";
import type { AttendanceExpInfo } from "@/api/game";
import { ApiErrorBody, SkinModelUserNotFoundError } from "@/api/skin";

/**
 * HealthKit 수면 단계 5종(asleepUnspecified/awake/asleepCore/asleepDeep/asleepREM 매핑,
 * useHealthData.ts의 SLEEP_STAGE_MAP 참고). 'UNSPECIFIED'는 임의로 다른 값으로 바꿔 보내지 말 것 —
 * 그러면 서버의 비율 분모가 오염되어 장벽 점수만 조용히 틀린다.
 */
export type SleepStage = "AWAKE" | "UNSPECIFIED" | "CORE" | "DEEP" | "REM";

export interface SleepSegment {
  stage: SleepStage;
  /** ISO 8601, 반드시 +09:00 오프셋 포함 (UTC 'Z' 변환 금지) */
  startTime: string;
  /** ISO 8601, 반드시 +09:00 오프셋 포함 (UTC 'Z' 변환 금지) */
  endTime: string;
}

export interface UploadSleepSessionRequest {
  segments: SleepSegment[];
  /** 워치 미착용 등으로 그 밤에 결측이면 필드 자체를 생략할 것(0으로 채우지 말 것) */
  hrv?: number;
  /** 워치 미착용 등으로 그 밤에 결측이면 필드 자체를 생략할 것(0으로 채우지 말 것) */
  restingHeartRate?: number;
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
  /**
   * 그날 스코어링에 참여한 피처의 부분점수 단순 평균 — 피부 예보 점수(forecast 쪽)와는 다른
   * 값이니 라벨을 섞지 말 것. 참여 피처가 0개인 날은 0점이 아니라 null.
   */
  sleepScore: number | null;
}

/** 피부 예보 개별 지표 — 산출 가능한 경우에만 채워짐 */
export interface ForecastMetric {
  score: number;
  grade: string;
}

/** darkCircle이 산출되지 않을 일은 없으므로(항상 값이 있음) unavailable 대상은 이 둘뿐 */
export type UnavailableForecastMetric = "COMPLEXION" | "BARRIER";

export interface UnavailableForecastReason {
  metric: UnavailableForecastMetric;
  /** 예: "MISSING_FEATURES" — 그 외 값이 추가될 수 있어 string으로 유지 */
  reason: string;
}

/**
 * GET /skin/forecast와 POST /sleep/sessions가 공유하는 피부 예보 모양 — 이 파일이 정의를 갖고
 * api/skin.ts가 재사용한다(중복 정의 금지, api/skin.ts 상단 주석 참고).
 */
export interface SkinForecast {
  /** 항상 값이 존재(null 불가) */
  darkCircle: ForecastMetric;
  /** 지표 산출이 불가하면 null */
  complexion: ForecastMetric | null;
  /** 지표 산출이 불가하면 null */
  barrier: ForecastMetric | null;
  unavailable: UnavailableForecastReason[];
}

export interface UploadSleepSessionData {
  processed: boolean;
  /** "YYYY-MM-DD" — 기상 시각의 날짜(서버가 결정, baseDate는 요청에 없음) */
  sleepDate: string;
  sleep: SleepStats;
  forecast: SkinForecast;
  /**
   * 수면 점수 상승/고득점 보상(reason: "SLEEP_SCORE_IMPROVED" | "SLEEP_SCORE_HIGH", 둘 다 실릴 수
   * 있음). 새 타입을 만들지 않고 api/game.ts의 AttendanceExpInfo를 그대로 재사용한다(모양이
   * 동일 — HOME-04/TODO-05와 파싱 코드·레벨업 연출을 공유하기 위함). processed:false(같은 데이터
   * 재수신)면 gained:0·reasons:[]로 내려온다 — 앱은 이 부호를 그대로 반영할 것(양수로 가정하고
   * 더하면 서버가 막은 무한 적립이 되살아난다).
   */
  exp: AttendanceExpInfo;
}

export interface UploadSleepSessionResponse {
  success: boolean;
  data: UploadSleepSessionData;
}

/**
 * 수면 세션 업로드(HOME-04 연동 API) — 앱이 시작될 때마다 호출한다. 새 데이터가 없어도 그냥
 * 호출하면 되며, 서버가 정규화 해시로 같은 수면인지 판별해 재처리를 건너뛴다(호출 전에 "새
 * 데이터가 있는지" 앱이 미리 판단할 필요 없음). 총 수면·단계별 분·각성 횟수 같은 집계값은
 * 절대 보내지 않는다 — 서버가 첫 기상에서 세션을 잘라 그 뒤 낮잠을 버리므로, 자르는 주체(서버)가
 * 세는 것이 맞다. inBed 필드는 보내지 말 것(서버가 무시함).
 * - 검증을 마친 날의 예보는 절대 바뀌지 않는다(사후에 대조 기준이 달라지면 적중률이 훼손되므로).
 * - 400 INVALID_INPUT/SLEEP_TIME_INVALID/SLEEP_STAGE_INVALID: 페이로드 버그. 400
 *   USER_ID_HEADER_INVALID: 헤더 누락/형식 오류.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → 다른 엔드포인트와 동일한 규칙으로
 *   SkinModelUserNotFoundError로 변환해 던진다. 그 외 에러는 원본 그대로 다시 던진다.
 */
export async function uploadSleepSession(
  data: UploadSleepSessionRequest,
  userId: number
): Promise<UploadSleepSessionResponse> {
  try {
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
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.error?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
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
  try {
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
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.error?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}
