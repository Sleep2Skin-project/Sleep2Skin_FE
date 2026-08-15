import { AxiosError } from "axios";

import { api } from "@/api/axios";
import type { ForecastMetric } from "@/api/sleep";

/** darkCircle이 산출되지 않을 일은 없으므로 unavailable 대상은 이 둘뿐 */
export type UnavailableSkinForecastMetric = "COMPLEXION" | "BARRIER";

export type UnavailableSkinForecastReason =
  | "MISSING_FEATURES"
  | "NO_SLEEP_STAGES"
  | "INSUFFICIENT_HISTORY";

export interface UnavailableSkinForecastEntry {
  metric: UnavailableSkinForecastMetric;
  reason: UnavailableSkinForecastReason;
}

export interface SkinForecastDetail {
  /** 항상 값이 존재 (null 불가) */
  darkCircle: ForecastMetric;
  /** 지표 산출이 불가하면 null */
  complexion: ForecastMetric | null;
  /** 지표 산출이 불가하면 null */
  barrier: ForecastMetric | null;
  unavailable: UnavailableSkinForecastEntry[];
}

/** 데이터가 있는 경우 */
export interface AvailableSkinForecastData {
  status: "AVAILABLE";
  message: null;
  baseDate: string;
  forecast: SkinForecastDetail;
}

/** 수면 데이터가 없는 빈 상태 — 에러 아님, 200으로 내려온다 */
export interface NoSleepDataSkinForecastData {
  status: "NO_SLEEP_DATA";
  message: string;
  baseDate: string;
  forecast: null;
}

/**
 * `status` 필드로만 분기할 것. `message`의 유무나 내용으로 분기하지 말 것
 * (규칙: NO_SLEEP_DATA도 200 OK로 내려오며 에러가 아니다).
 */
export type SkinForecastData = AvailableSkinForecastData | NoSleepDataSkinForecastData;

export interface SkinForecastQueryResponse {
  success: boolean;
  data: SkinForecastData;
}

export async function getSkinForecast(
  baseDate: string,
  userId: number
): Promise<SkinForecastQueryResponse> {
  const response = await api.get<SkinForecastQueryResponse>(
    "/api/v1/skin/forecast",
    {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    }
  );
  return response.data;
}

// ===== 내 모델 — 일반 vs 개인화 (REP-12) =====
// 셀피 검증으로 학습된 개인 가중치를 일반 가중치와 비교해 보여주는 API.
// baseDate를 받지 않는다 — 누적 검증 횟수/가중치는 "오늘"이 필요 없는, 날짜 무관 데이터다.

export interface SkinModelFeature {
  feature: string;
  label: string;
  /**
   * 개인화 전 기준선. 같은 metric의 feature 개수가 n개면 1/n (지표 내 균등 분배).
   */
  generalShare: number;
  /**
   * 셀피 검증으로 학습된 실제 비중 — 예보가 실제로 사용하는 숫자.
   * 개인 가중치는 일반 가중치에 ratio를 곱한 뒤, 같은 metric 내 합이 1이 되도록 재정규화된 값이다.
   */
  personalShare: number;
  /**
   * personalShare / generalShare — 일반 대비 몇 배인지.
   * 같은 metric(지표) 안에서만 의미가 있다. 재정규화 때문에 스케일이 달라지므로
   * **다른 metric의 ratio/generalShare/personalShare와 절대 비교하지 말 것.**
   * 전부 1.0인 것은 오류가 아니라 "아직 배울 게 없었다"는 뜻이며, 신규 사용자에게 정상이다
   * (이때 headline은 "아직은 일반 모델과 같아요" 형태로 내려온다).
   */
  ratio: number;
}

export interface SkinModelMetric {
  metric: string;
  /** 같은 metric 안의 feature들끼리만 ratio/share 비교가 성립한다 */
  features: SkinModelFeature[];
}

export interface SkinModelDetail {
  /**
   * 신뢰도 등급(下/中/上)은 서버가 주지 않는다. 컷오프를 서버에 두면 바꿀 때마다 배포해야 하므로
   * 서버는 누적 검증 횟수만 주고, 등급 해석은 앱이 calculateModelReliability로 계산한다.
   */
  verificationCount: number;
  /** 한 metric 안에서 최대/최소 ratio 차이가 가장 큰 곳을 골라 서버가 만든 문장 */
  headline: string;
  metrics: SkinModelMetric[];
}

/** 개인화 모델이 있는 경우. 개인 가중치 행의 존재 자체가 "개인화가 시작됐다"는 뜻 */
export interface AvailableSkinModelData {
  status: "AVAILABLE";
  message: string | null;
  model: SkinModelDetail;
}

/** 아직 한 번도 검증한 적 없는 빈 상태 — 에러 아님, 200으로 내려온다 */
export interface NoVerificationSkinModelData {
  status: "NO_VERIFICATION";
  message: string | null;
  model: null;
}

/**
 * `status` 필드로만 분기할 것. `model`의 null 여부로 분기하지 말 것
 * (규칙: NO_VERIFICATION도 200 OK로 내려오며 에러가 아니다).
 */
export type SkinModelData = AvailableSkinModelData | NoVerificationSkinModelData;

export interface SkinModelResponse {
  success: boolean;
  data: SkinModelData;
}

/** 서버가 내려주는 에러 바디의 code 필드 (예: "USER_NOT_FOUND") */
export interface ApiErrorBody {
  code?: string;
  message?: string;
}

/**
 * GET /api/v1/skin/model의 404 USER_NOT_FOUND — 존재하지 않는 사용자.
 * 호출부가 `instanceof`로 구분해 일반 네트워크 에러와 다르게 처리할 수 있도록 별도 에러 클래스로 던진다.
 */
export class SkinModelUserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";
  readonly userId: number;

  constructor(userId: number) {
    super(`USER_NOT_FOUND: userId=${userId}`);
    this.name = "SkinModelUserNotFoundError";
    this.userId = userId;
  }
}

/**
 * 내 모델(일반 vs 개인화) 조회.
 * - 200: 개인화 전(NO_VERIFICATION)인 경우도 정상 응답이며 여기 포함된다.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → SkinModelUserNotFoundError로 변환해 던진다.
 *   그 외 에러(네트워크 오류 등)는 원본 그대로 다시 던진다.
 */
export async function getSkinModel(userId: number): Promise<SkinModelResponse> {
  try {
    const response = await api.get<SkinModelResponse>("/api/v1/skin/model", {
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

export type ModelReliabilityGrade = "하" | "중" | "상";

/**
 * verificationCount(누적 검증 횟수)로 신뢰도 등급을 매긴다.
 * 서버는 등급을 내려주지 않으므로 클라이언트에서 임의 기준(1~4회: 하, 5~9회: 중, 10회 이상: 상)으로 계산한다.
 */
export function calculateModelReliability(count: number): ModelReliabilityGrade {
  if (count >= 10) return "상";
  if (count >= 5) return "중";
  return "하";
}

// ===== 셀피 분석·검증·학습 (HOME-06→07→08) =====
// 흐름: 멀티파트 수신 → 메모리에서 OpenAI Vision 호출(HOME-06) → 지표 3종 실측 저장
// → 예보와 대조·판정(HOME-07) → 개인 가중치 보정, 다음 예보에 즉시 반영(HOME-08).
// 셀피 원본은 보관하지 않는다: 이미지는 멀티파트 → 서버 메모리 → OpenAI로만 흐르고,
// 저장되는 건 지표 숫자 3개뿐이다. 오브젝트 스토리지를 거치지 않고 DB에 이미지 경로/URL 컬럼 자체가 없다.

/**
 * 셀피 업로드 전 사용자에게 반드시 고지해야 하는 문구. 주어를 생략하지 않은 원문 그대로 사용할 것
 * (UI 카피를 임의로 줄이거나 바꾸지 말 것).
 */
export const SELFIE_PRIVACY_NOTICE =
  "분석을 위해 외부 AI(OpenAI)로 이미지가 전송됩니다. 서버에 저장하지 않으며, 분석 직후 즉시 삭제하고 얼굴을 복원할 수 있는 데이터를 보관하지 않습니다.";

export type VerificationMetricName = "DARK_CIRCLE" | "BARRIER" | "COMPLEXION";

/**
 * difference(forecast.score − measured.score) 기준 판정.
 * 점수 축과 위험 축이 반대이므로 부호 해석에 주의할 것.
 * - HIT: |difference| ≤ 5 (거의 일치)
 * - CLOSE: 6 ≤ |difference| ≤ 15 (비슷하게 예측)
 * - UNDERESTIMATED: difference ≤ -16 (예보 점수를 낮게 예측 = 피부 위험을 과대평가)
 * - OVERESTIMATED: difference ≥ 16 (예보 점수를 높게 예측 = 피부 위험을 과소평가)
 */
export type VerificationVerdict = "HIT" | "CLOSE" | "UNDERESTIMATED" | "OVERESTIMATED";

export interface SelfieScoreGrade {
  score: number;
  grade: string;
}

/**
 * 예보와 실측을 모두 대조한 지표.
 * verifications 배열 자체는 항상 1개 이상 존재한다(실측 3종 중 예보와 대조 가능했던 것만 여기 담김).
 */
export interface VerificationMetric {
  metric: VerificationMetricName;
  forecast: SelfieScoreGrade;
  measured: SelfieScoreGrade;
  /** forecast.score − measured.score. 부호 해석은 VerificationVerdict 문서 참고 */
  difference: number;
  verdict: VerificationVerdict;
}

/**
 * 그날 예보가 없어 대조하지 못한 지표. 실측 자체는 항상 3종이 나오므로 measured는 존재하며,
 * 갈리는 건 예보 쪽뿐이다. hitRate 분모(verifications.length)에서 제외된다.
 */
export interface SkippedMetric {
  metric: string;
  measured: SelfieScoreGrade;
  reason: string;
}

/** 실제로 값이 바뀐 피처 행만 담긴다(변화 없는 피처는 changes에 나타나지 않음) */
export interface ModelChange {
  feature: string;
  metric: string;
  label: string;
  before: number;
  after: number;
}

export interface SelfieVerificationModelResult {
  updated: boolean;
  message: string;
  changes: ModelChange[];
}

export interface SelfieVerificationData {
  baseDate: string;
  analyzedAt: string;
  /** 항상 1개 이상 존재 */
  verifications: VerificationMetric[];
  skipped: SkippedMetric[];
  /** 분모는 3이 아니라 verifications.length. verifications는 비지 않으므로 0/0은 발생하지 않는다 */
  hitRate: number;
  model: SelfieVerificationModelResult;
}

export interface SelfieVerificationResponse {
  success: boolean;
  data: SelfieVerificationData;
}

/**
 * POST /api/v1/skin/selfie 예외 코드.
 * - SELFIE_IMAGE_INVALID (400): image 파트가 없거나 비었음 → 다시 촬영
 * - INVALID_INPUT (400): baseDate 누락 등 요청 자체가 잘못됨
 * - USER_ID_HEADER_INVALID (400): X-User-Id 헤더 누락/형식 오류
 * - USER_NOT_FOUND (404): 존재하지 않는 사용자
 * - SKIN_FORECAST_NOT_FOUND (404): 그날 예보가 없음 → 수면을 먼저 업로드해야 한다
 * - VERIFICATION_ALREADY_DONE (409): 하루 1회 제한 — 그날 이미 검증함 → 결과 화면으로 이동
 * - SELFIE_ANALYSIS_FAILED (502): OpenAI Vision 분석 실패 → 재시도 가능(행이 생기지 않으므로 안전)
 * - SELFIE_ANALYSIS_TIMEOUT (504): 분석 타임아웃 → 재시도 가능(행이 생기지 않으므로 안전)
 */
export type SelfieVerificationErrorCode =
  | "SELFIE_IMAGE_INVALID"
  | "INVALID_INPUT"
  | "USER_ID_HEADER_INVALID"
  | "USER_NOT_FOUND"
  | "SKIN_FORECAST_NOT_FOUND"
  | "VERIFICATION_ALREADY_DONE"
  | "SELFIE_ANALYSIS_FAILED"
  | "SELFIE_ANALYSIS_TIMEOUT";

/**
 * POST /api/v1/skin/selfie가 예외 코드와 함께 실패했을 때 던지는 에러.
 * 호출부는 `error.code`로 분기해 SelfieVerificationErrorCode 문서에 적힌 대로 처리할 것
 * (예: SKIN_FORECAST_NOT_FOUND → 수면 업로드 유도, VERIFICATION_ALREADY_DONE → 결과 화면 이동).
 */
export class SelfieVerificationApiError extends Error {
  readonly code: SelfieVerificationErrorCode;
  readonly status: number;

  constructor(code: SelfieVerificationErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "SelfieVerificationApiError";
    this.code = code;
    this.status = status;
  }
}

/** 502/504는 실패해도 행이 생기지 않아 재시도가 안전하므로, verifySelfie가 1회 자동 재시도하는 대상 */
const RETRYABLE_SELFIE_ERROR_CODES: ReadonlySet<SelfieVerificationErrorCode> = new Set([
  "SELFIE_ANALYSIS_FAILED",
  "SELFIE_ANALYSIS_TIMEOUT",
]);

function toSelfieVerificationError(error: unknown): unknown {
  if (error instanceof AxiosError && error.response) {
    const status = error.response.status;
    const body = error.response.data as ApiErrorBody | undefined;
    let code = body?.code as SelfieVerificationErrorCode | undefined;
    // 502/504는 게이트웨이가 JSON 바디 없이 순수 상태 코드만 내려줄 수 있어 status로도 폴백한다.
    if (!code) {
      if (status === 502) code = "SELFIE_ANALYSIS_FAILED";
      else if (status === 504) code = "SELFIE_ANALYSIS_TIMEOUT";
    }
    if (code) {
      return new SelfieVerificationApiError(code, status, body?.message);
    }
  }
  return error;
}

async function postSelfieVerification(
  userId: number,
  baseDate: string,
  formData: FormData
): Promise<SelfieVerificationResponse> {
  const response = await api.post<SelfieVerificationResponse>(
    "/api/v1/skin/selfie",
    formData,
    {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
}

/**
 * 셀피를 업로드해 피부 지표 3종을 실측하고, baseDate 예보와 대조·판정한 뒤 개인 가중치를 보정한다.
 * - baseDate는 동작(POST) API임에도 쿼리 파라미터로 필요하다(서버는 "오늘"을 모름, 과거 날짜도 허용).
 * - image는 폼 필드가 아니라 멀티파트 파트, RN 환경이라 `{ uri, name, type } as any`로 append한다.
 * - 하루 1회 제한: 같은 날 두 번째 호출은 409 VERIFICATION_ALREADY_DONE.
 * - 502/504는 자동으로 1회 재시도한다(실패 시 행이 생기지 않아 재시도가 안전하기 때문). 그 외 4xx는
 *   재시도해도 결과가 같으므로 재시도하지 않고 SelfieVerificationApiError로 즉시 던진다.
 */
export async function verifySelfie(
  userId: number,
  baseDate: string,
  imageUri: string
): Promise<SelfieVerificationResponse> {
  const formData = new FormData();
  formData.append("image", {
    uri: imageUri,
    name: "selfie.jpg",
    type: "image/jpeg",
  } as any);

  try {
    return await postSelfieVerification(userId, baseDate, formData);
  } catch (firstError) {
    const error = toSelfieVerificationError(firstError);
    if (error instanceof SelfieVerificationApiError && RETRYABLE_SELFIE_ERROR_CODES.has(error.code)) {
      try {
        return await postSelfieVerification(userId, baseDate, formData);
      } catch (secondError) {
        throw toSelfieVerificationError(secondError);
      }
    }
    throw error;
  }
}

// ===== 적중률·연속 검증 배너 (HOME-09) =====
// 최근 검증 1건 + 누적 적중률 + 연속 검증 횟수를 한 번에 내려주는 배너용 API.

/**
 * 특정 날짜(baseDate) 1건에 대한 검증 결과. POST /api/v1/skin/selfie 응답과 같은 모양
 * (verifications/skipped 타입을 그대로 재사용).
 */
export interface LatestVerificationSummary {
  baseDate: string;
  /** 그날치 적중률. summary.hitRate(누적)와 다른 숫자이니 섞어 쓰지 말 것 */
  hitRate: number;
  /** 항상 1개 이상 존재 */
  verifications: VerificationMetric[];
  skipped: SkippedMetric[];
}

/**
 * 배너에 쓰는 요약 통계.
 *
 * - hitRate: **누적** 적중률. 지금까지 모든 판정 중 HIT 비율이다. `latest.hitRate`(그날치)와는
 *   다른 숫자이며 절대 바꿔 쓰면 안 된다 — 최근 1건만 쓰면 분모가 최대 3이라 0·33·67·100으로만
 *   튀고 하루마다 요동치는데, 배너가 말하려는 건 "예보가 얼마나 믿을 만한가"이므로 표본이
 *   쌓일수록 안정돼야 한다. 그날치가 필요하면 latest.hitRate를 쓸 것.
 *   누적 분모도 검증 일수 × 3이 아니다 — 그날 예보가 없어 판정 자체가 없었던 지표(스킵된 지표)는
 *   POST /skin/selfie와 같은 규칙으로 분모에서 빠진다.
 * - verificationCount: 누적 검증 횟수(=hitRate의 표본이 된 검증 세션 수).
 * - streakCount: 연속 검증 횟수. **오늘 미검증이 연속을 끊지 않는다.**
 *   baseDate(오늘)가 오늘 또는 어제부터 하루도 빠짐없이 이어진 날짜의 개수로 계산된다.
 *   예: 오늘✅·어제✅·그제❌ → 2 / 오늘❌·어제✅·그제✅ → 2(끊기지 않음) /
 *   오늘❌·어제❌ → 0 / 오늘 첫 검증 → 1.
 *   저녁에 검증하는 사용자가 아침에 앱을 열었을 때 어제까지 쌓은 연속이 0으로 보이면 아직
 *   하지 않은 일로 사용자를 벌주는 것처럼 읽히기 때문. 이 계산을 위해 baseDate가 필수 파라미터다
 *   (서버는 "오늘"을 모르므로 없이 계산하면 연속이 하루 밀린다).
 * - latest: 가장 최근 검증 1건의 상세.
 */
export interface VerificationSummary {
  hitRate: number;
  verificationCount: number;
  streakCount: number;
  latest: LatestVerificationSummary;
}

/** 검증 이력이 있는 경우 */
export interface AvailableVerificationSummaryData {
  status: "AVAILABLE";
  message: string | null;
  baseDate: string;
  summary: VerificationSummary;
}

/** 검증 이력이 전혀 없는 빈 상태 — 에러 아님, 200으로 내려온다. 신규 사용자에게 일상적으로 발생 */
export interface NoVerificationSummaryData {
  status: "NO_VERIFICATION";
  message: string | null;
  baseDate: string;
  summary: null;
}

/**
 * `status` 필드로만 분기할 것. `summary`의 null 여부로 분기하지 말 것
 * (규칙: NO_VERIFICATION도 200 OK로 내려오며 에러가 아니다).
 */
export type VerificationSummaryData = AvailableVerificationSummaryData | NoVerificationSummaryData;

export interface VerificationSummaryResponse {
  success: boolean;
  data: VerificationSummaryData;
}

/**
 * 적중률·연속 검증 배너 조회.
 * - baseDate는 "오늘"을 서버가 모르기 때문에 필수 쿼리 파라미터다 — 특히 streakCount(연속 검증
 *   횟수) 계산이 baseDate 기준이라, 빠지면 연속이 하루 밀려서 계산된다.
 * - 200: 검증 이력이 없는 경우(NO_VERIFICATION, summary: null)도 정상 응답이며 여기 포함된다.
 * - 400 INVALID_INPUT: baseDate 누락 또는 형식(YYYY-MM-DD) 오류.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → SkinModelUserNotFoundError로 변환해 던진다
 *   (다른 엔드포인트와 동일한 사용자 식별 실패이므로 기존 에러 클래스를 재사용).
 *   그 외 에러(네트워크 오류, 400 등)는 원본 그대로 다시 던진다.
 */
export async function getVerificationSummary(
  userId: number,
  baseDate: string
): Promise<VerificationSummaryResponse> {
  try {
    const response = await api.get<VerificationSummaryResponse>(
      "/api/v1/skin/verification/summary",
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
      if (body?.code === "USER_NOT_FOUND" || body === undefined) {
        throw new SkinModelUserNotFoundError(userId);
      }
    }
    throw error;
  }
}
