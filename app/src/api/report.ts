import { AxiosError } from "axios";

import { api } from "@/api/axios";
import { ApiErrorBody, SkinModelUserNotFoundError } from "@/api/skin";

// ===== 일간 리포트 (REP-02, 04, 05) =====
// 그날의 수면 요약(sleepSummary)과 피부 예보 전일 대비(skinForecast)를 한 번에 내려주는 API.
// 두 섹션은 완전히 독립적이다 — 각자 자기 status/message를 가지며, 응답 전체를 하나의 상태로
// 감싸지 않는다. 한쪽이 NO_SLEEP_DATA라고 다른 쪽까지 숨기면 안 된다(호출부에서 반드시 두 상태를
// 따로 검사할 것).

export interface DailyReportSleepSummary {
  totalSleepMinutes: number;
  /**
   * 예보 점수(가중평균)와는 다른 숫자다 — 그날 참여한 수면 피처 부분점수의 단순 평균
   * ("오늘 수면이 전반적으로 몇 점이었나"). 다른 화면의 "예보 적중률/점수"와 섞어 쓰지 말 것.
   */
  sleepScore: number;
  deepSleepMinutes: number;
  /** 얕은 수면(HealthKit asleepCore)을 리포트 노출용으로 부르는 이름. SleepStats.coreSleepMinutes와 같은 개념 */
  lightSleepMinutes: number;
  /** 프론트에서 재계산하지 말고 API 값을 그대로 쓸 것 */
  awakeCount: number;
  /** 프론트에서 재계산하지 말고 API 값을 그대로 쓸 것 */
  awakeMinutes: number;
}

/** 그날 수면 데이터가 있는 경우 */
export interface AvailableDailyReportSleepSummary {
  status: "AVAILABLE";
  message: null;
  summary: DailyReportSleepSummary;
}

/** 그날 수면 데이터가 없는 빈 상태 — 에러 아님, 200으로 내려온다 */
export interface NoSleepDataDailyReportSleepSummary {
  status: "NO_SLEEP_DATA";
  message: string | null;
  summary: null;
}

/**
 * `status` 필드로만 분기할 것. `summary`의 null 여부로 분기하지 말 것
 * (규칙: NO_SLEEP_DATA도 200 OK로 내려오며 에러가 아니다).
 */
export type DailyReportSleepSummarySection =
  | AvailableDailyReportSleepSummary
  | NoSleepDataDailyReportSleepSummary;

export interface DailyReportForecastMetric {
  /** 그날 지표 산출을 못 했으면(워치 미착용 등) null */
  today: number | null;
  /**
   * (오늘 - 어제) 값. 오늘 값이 없거나, 전날 예보 자체가 없거나, 전날에도 이 지표가 없었으면 null.
   * 0(변화 없음)과 null(비교 불가)은 서로 다른 값이니 절대 같은 것으로 취급하지 말 것.
   */
  diffFromYesterday: number | null;
}

/**
 * skinForecast는 sleepSummary와 달리 AVAILABLE/NO_SLEEP_DATA 두 상태에서 필드 모양(darkCircle
 * 등 세 지표 키)이 동일하다 — NO_SLEEP_DATA일 땐 세 지표의 today/diffFromYesterday가 전부 null로
 * 채워진 채 내려온다(명세 확정 사항). 그래도 렌더링 분기는 반드시 `status`로 할 것, 개별 필드의
 * null 여부로 임의 판단하지 말 것.
 */
export interface DailyReportSkinForecast {
  status: "AVAILABLE" | "NO_SLEEP_DATA";
  message: string | null;
  darkCircle: DailyReportForecastMetric;
  complexion: DailyReportForecastMetric;
  barrier: DailyReportForecastMetric;
}

export interface DailyReportData {
  baseDate: string;
  sleepSummary: DailyReportSleepSummarySection;
  skinForecast: DailyReportSkinForecast;
}

export interface DailyReportResponse {
  success: boolean;
  data: DailyReportData;
}

/**
 * 일간 리포트(수면 요약 + 피부 예보 전일 대비) 조회.
 * - baseDate: 기상일 기준 "YYYY-MM-DD". 필수 쿼리 파라미터.
 * - 200: sleepSummary/skinForecast 각각의 NO_SLEEP_DATA(빈 상태)도 정상 응답이며 여기 포함된다.
 * - 400 INVALID_INPUT: baseDate 누락 또는 형식 오류. USER_ID_HEADER_INVALID: X-User-Id 헤더 누락/형식 오류.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → 다른 엔드포인트와 동일한 규칙으로
 *   SkinModelUserNotFoundError로 변환해 던진다. 그 외 에러(네트워크 오류 등)는 원본 그대로 다시 던진다.
 */
export async function getDailyReport(
  baseDate: string,
  userId: number
): Promise<DailyReportResponse> {
  try {
    const response = await api.get<DailyReportResponse>("/api/v1/report/daily", {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}

// ===== 월간 리포트 (REP-07) =====
// 최근 28일을 7일씩 4주(W1~W4)로 나눠 주별 수면 점수 평균/최고 주, 28일 통합 요약, 수면-피부
// 상관관계를 한 번에 내려주는 API. 일간 리포트(sleepSummary/skinForecast가 각자 독립 상태)와
// 달리, 이 API는 응답 전체가 하나의 `status`(FULL | INSUFFICIENT_DATA)로 묶인다.

/**
 * 4주 구간은 가입일이 아니라 baseDate 기준으로 역산한다: periodStart = baseDate-27,
 * periodEnd = baseDate. W1(가장 과거, baseDate-27~-21) → W4(가장 최근 7일, baseDate-6~baseDate).
 */
export interface MonthlyReportWeek {
  weekLabel: "W1" | "W2" | "W3" | "W4";
  /** 그 주 7일 중 데이터가 있는 날짜만의 평균(반올림, 서버 계산). 7일 모두 결측이면 null */
  avgSleepScore: number | null;
  /** avgSleepScore와 완전히 별개로 계산·결측 처리된다(한쪽만 null일 수 있음) */
  avgDeepSleepMinutes: number | null;
  /**
   * 4주 중 avgSleepScore가 가장 높은 주(들)만 true. null인 주는 비교에서 제외, 동점이면 해당
   * 주 전부 true, 4주 전부 null이면 비교값이 없어 전부 false. avgDeepSleepMinutes는 이 판정에
   * 관여하지 않는다(오직 수면 점수 기준) — 프론트에서 다시 순위를 매기지 말고 이 값을 그대로 쓸 것.
   */
  isHighest: boolean;
}

/**
 * 28일 전체 "일별" 값을 한 번에 평균 낸 것 — weeks[].avgSleepScore 4개를 다시 평균 낸 값이
 * 아니다(주마다 결측 일수가 달라 가중치가 다르므로 서로 다른 숫자가 나온다). 프론트에서 weeks로
 * 부터 이 값을 재계산하지 말 것. 28일이 전부 결측이어야 null.
 */
export interface MonthlyReportSummary {
  avgSleepScore: number | null;
  avgDeepSleepMinutes: number | null;
}

/**
 * 수면 피처 → 피부 지표 상관관계 한 쌍. sleepFeature/skinMetric의 정확한 코드값 전체 목록은
 * 서버가 늘릴 수 있어 string으로 열어둔다 — 화면에는 이 raw 코드 대신 항상 featureLabel/
 * metricLabel(사람이 읽는 라벨)을 쓸 것. 현재 명세로 확인된 7개 조합: 야간각성→다크서클,
 * 총수면→다크서클, 깊은수면→장벽, REM→장벽, 취침규칙성→안색, HRV→안색, 안정시심박→안색.
 */
export interface MonthlyReportCorrelation {
  sleepFeature: string;
  featureLabel: string;
  skinMetric: string;
  metricLabel: string;
  /** 표본이 5개 미만(insufficientSample: true)이면 반드시 null */
  strength: string | null;
  sampleSize: number;
  /** 표본 5개 미만이면 true */
  insufficientSample: boolean;
}

/** 가입 후 28일이 지나 4주치 데이터가 충분한 경우 */
export interface FullMonthlyReportData {
  status: "FULL";
  periodStart: string;
  periodEnd: string;
  weeks: MonthlyReportWeek[];
  summary: MonthlyReportSummary;
  /** 상관계수 절댓값 내림차순 정렬, 표본 부족 항목은 맨 뒤 — 서버가 순서를 보장하므로 재정렬 불필요 */
  correlations: MonthlyReportCorrelation[];
}

/**
 * 가입일을 1일차로 세어 28일 미만인 빈 상태 — 에러 아님, 200으로 내려온다.
 * weeks/correlations는 반드시 빈 배열, summary는 반드시 null.
 */
export interface InsufficientMonthlyReportData {
  status: "INSUFFICIENT_DATA";
  periodStart: string;
  periodEnd: string;
  weeks: MonthlyReportWeek[];
  summary: null;
  correlations: MonthlyReportCorrelation[];
}

/**
 * `status` 필드로만 분기할 것. `weeks.length`나 `summary`의 null 여부로 분기하지 말 것
 * (규칙: INSUFFICIENT_DATA도 200 OK로 내려오며 에러가 아니다 — UI에서 에러로 취급하지 말고
 * "가입 후 28일이 지나야 월간 리포트가 제공됩니다" 같은 빈 상태로 렌더링할 것).
 */
export type MonthlyReportData = FullMonthlyReportData | InsufficientMonthlyReportData;

export interface MonthlyReportResponse {
  success: boolean;
  data: MonthlyReportData;
}

/**
 * 월간 리포트(주별 수면 점수/최고 주, 28일 요약, 수면-피부 상관관계) 조회.
 * - baseDate: periodEnd가 되는 기준일 "YYYY-MM-DD". 필수 쿼리 파라미터.
 * - 200: INSUFFICIENT_DATA(빈 상태)도 정상 응답이며 여기 포함된다.
 * - 400 INVALID_INPUT / USER_ID_HEADER_INVALID, 404 USER_NOT_FOUND(SkinModelUserNotFoundError로 변환)는
 *   다른 report 엔드포인트와 동일 규칙.
 */
export async function getMonthlyReport(
  baseDate: string,
  userId: number
): Promise<MonthlyReportResponse> {
  try {
    const response = await api.get<MonthlyReportResponse>("/api/v1/report/monthly", {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}

// ===== 일간 수면 타임라인 (REP-03) =====
// 그날 밤의 수면 단계 구간을 시간순으로 보여주는 API. GET /report/daily(위)와는 완전히 별개
// 엔드포인트이며, 합계(총 수면/단계별 분 수 등)는 이미 GET /report/daily가 계산해 내려주므로
// 이 엔드포인트의 segments로 그런 합계를 다시 계산하면 안 된다 — segments는 오직 타임라인을
// 그리기 위한 렌더링 전용 데이터다(각 구간 자체의 시작~끝으로 그 구간의 너비를 정하는 것은
// "렌더링"이지 "합계 재계산"이 아니니 허용되지만, 여러 구간을 stage별로 합산해 총 시간을
// 만들어내는 건 금지).

/** DEEP/REM/CORE/AWAKE 외에 단계를 특정하지 못한 구간도 내려올 수 있다 — 임의 변환 없이 그대로 렌더링할 것 */
export type SleepTimelineStage = "DEEP" | "REM" | "CORE" | "AWAKE" | "UNSPECIFIED";

export interface DailyTimelineSegment {
  stage: SleepTimelineStage;
  /** ISO 8601, +09:00 오프셋 포함 */
  startTime: string;
  /** ISO 8601, +09:00 오프셋 포함 */
  endTime: string;
}

/** 그날 수면 데이터가 있는 경우. segments는 startTime 오름차순 정렬이 서버에서 보장된다(재정렬 불필요) */
export interface AvailableDailyTimeline {
  status: "AVAILABLE";
  message: null;
  baseDate: string;
  sleepOnsetTime: string;
  wakeTime: string;
  segments: DailyTimelineSegment[];
}

/** 그날 수면 데이터가 없는 빈 상태 — 에러 아님, 200으로 내려온다. sleepOnsetTime/wakeTime은 반드시 null, segments는 반드시 빈 배열 */
export interface NoSleepDataDailyTimeline {
  status: "NO_SLEEP_DATA";
  message: string | null;
  baseDate: string;
  sleepOnsetTime: null;
  wakeTime: null;
  segments: DailyTimelineSegment[];
}

/**
 * `status` 필드로만 분기할 것. `segments.length`나 `sleepOnsetTime`의 null 여부로 분기하지 말 것
 * (규칙: NO_SLEEP_DATA도 200 OK로 내려오며 에러가 아니다 — UI에서 에러로 취급하지 말고 빈 상태로 렌더링할 것).
 */
export type DailyTimelineData = AvailableDailyTimeline | NoSleepDataDailyTimeline;

export interface DailyTimelineResponse {
  success: boolean;
  data: DailyTimelineData;
}

/**
 * 일간 수면 타임라인 조회.
 * - baseDate: 기상일 기준 "YYYY-MM-DD". 필수 쿼리 파라미터.
 * - 200: NO_SLEEP_DATA(빈 상태)도 정상 응답이며 여기 포함된다.
 * - 400 INVALID_INPUT / USER_ID_HEADER_INVALID, 404 USER_NOT_FOUND(SkinModelUserNotFoundError로 변환)는
 *   다른 report 엔드포인트와 동일 규칙.
 */
export async function getDailyTimeline(
  baseDate: string,
  userId: number
): Promise<DailyTimelineResponse> {
  try {
    const response = await api.get<DailyTimelineResponse>("/api/v1/report/daily/timeline", {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}

// ===== 주간 리포트 (REP-06) =====
// 최근 7일 하루치 수면 점수 추이, 요약, 수면-피부 상관관계(실측값 기준)를 한 번에 내려주는 API.
// 월간 리포트와 마찬가지로 응답 전체가 하나의 `status`(FULL | INSUFFICIENT_DATA)로 묶인다.
//
// 🚨 신규 사용자(INSUFFICIENT_DATA)와 기존 사용자의 결측치(FULL이지만 특정 날짜만 null)는 서로
// 다른 케이스다 — 절대 섞어서 분기하지 말 것.
// - 가입일을 1일차로 세어(가입일부터 baseDate까지 일수 + 1) 7일 미만인 신규 사용자만
//   INSUFFICIENT_DATA다. 이때 dailyScores/correlations는 빈 배열, summary는 null.
// - 가입한 지 오래됐지만 그 주에 안 잔 경우는 여전히 FULL이다. dailyScores는 항상 7개가 내려오되
//   세션이 없는 날짜만 sleepScore: null로 표시된다.

export interface WeeklyReportDailyScore {
  /** "YYYY-MM-DD" */
  date: string;
  /** 세션이 없는 날짜는 null. 단순 평균(예보 점수와 다름) */
  sleepScore: number | null;
}

/**
 * sleepScore 또는 deepSleepMinutes가 존재하는 날짜만의 평균(반올림, 서버 계산) — 두 값은 서로
 * 별개로 계산·결측 처리된다. 전부 결측이면 null. 프론트에서 dailyScores로부터 재계산하지 말 것.
 */
export interface WeeklyReportSummary {
  avgSleepScore: number | null;
  avgDeepSleepMinutes: number | null;
}

/**
 * 예보값이 아니라 실측값(셀피 검증)과 비교한 상관관계 — 월간 리포트의 correlations와 값의 출처가
 * 다르다. 표본이 5개 미만이어도 배열에서 빠지지 않고 항상 7개 전부 내려온다(월간과 달리 "항상
 * 7개"가 명세로 확정됨). 서버가 상관계수 절댓값 내림차순 정렬 + 표본 부족은 값과 무관하게 맨
 * 뒤로 보장한다(재정렬 불필요). sleepFeature/skinMetric 원문 코드 대신 항상 featureLabel/
 * metricLabel을 화면에 쓸 것(월간 리포트와 동일 원칙).
 */
export interface WeeklyReportCorrelation {
  sleepFeature: string;
  featureLabel: string;
  skinMetric: string;
  metricLabel: string;
  /** 표본이 5개 미만(insufficientSample: true)이면 반드시 null */
  strength: string | null;
  sampleSize: number;
  /** 표본 5개 미만이면 true */
  insufficientSample: boolean;
}

/** 가입 후 7일이 지나 7일치 데이터가 충분한 경우 — 특정 날짜의 세션 결측은 이 상태에서도 발생할 수 있다(위 주석 참고) */
export interface FullWeeklyReportData {
  status: "FULL";
  periodStart: string;
  periodEnd: string;
  /** 항상 7개 */
  dailyScores: WeeklyReportDailyScore[];
  summary: WeeklyReportSummary;
  /** 항상 7개(표본 부족이어도 제외되지 않음) */
  correlations: WeeklyReportCorrelation[];
}

/**
 * 가입일을 1일차로 세어 7일 미만인 신규 사용자 빈 상태 — 에러 아님, 200으로 내려온다.
 * dailyScores/correlations는 반드시 빈 배열, summary는 반드시 null.
 */
export interface InsufficientWeeklyReportData {
  status: "INSUFFICIENT_DATA";
  periodStart: string;
  periodEnd: string;
  dailyScores: WeeklyReportDailyScore[];
  summary: null;
  correlations: WeeklyReportCorrelation[];
}

/**
 * `status` 필드로만 분기할 것. `dailyScores.length`나 `summary`의 null 여부로 분기하지 말 것
 * (규칙: INSUFFICIENT_DATA도 200 OK로 내려오며 에러가 아니다 — UI에서 에러로 취급하지 말고
 * "가입 후 7일이 지나야 주간 리포트가 제공됩니다" 같은 빈 상태로 렌더링할 것).
 */
export type WeeklyReportData = FullWeeklyReportData | InsufficientWeeklyReportData;

export interface WeeklyReportResponse {
  success: boolean;
  data: WeeklyReportData;
}

/**
 * 주간 리포트(하루치 수면 점수 추이, 요약, 수면-피부 상관관계) 조회.
 * - baseDate: periodEnd가 되는 기준일 "YYYY-MM-DD". 필수 쿼리 파라미터.
 * - 200: INSUFFICIENT_DATA(빈 상태)도 정상 응답이며 여기 포함된다.
 * - 400 INVALID_INPUT / USER_ID_HEADER_INVALID, 404 USER_NOT_FOUND(SkinModelUserNotFoundError로 변환)는
 *   다른 report 엔드포인트와 동일 규칙.
 */
export async function getWeeklyReport(
  baseDate: string,
  userId: number
): Promise<WeeklyReportResponse> {
  try {
    const response = await api.get<WeeklyReportResponse>("/api/v1/report/weekly", {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      const body = error.response.data as ApiErrorBody | undefined;
      if (body?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}
