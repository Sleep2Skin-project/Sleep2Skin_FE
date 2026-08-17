import { AxiosError } from "axios";

import { api } from "@/api/axios";
import { ApiErrorBody, SkinModelUserNotFoundError } from "@/api/skin";

export interface ConsentAgreeData {
  consentId: number;
  termsVersion: string;
  /** ISO 8601, UTC('Z') 형태로 내려옴 */
  agreedAt: string;
  newlyAgreed: boolean;
}

export interface ConsentAgreeResponse {
  success: boolean;
  data: ConsentAgreeData;
}

/**
 * Request Body 없음. termsVersion/agreedAt은 서버가 결정하므로 클라이언트는 보내지 않는다.
 */
export async function saveUserConsent(userId: number): Promise<ConsentAgreeResponse> {
  try {
    const response = await api.post<ConsentAgreeResponse>(
      "/api/v1/users/me/consents",
      null,
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

export interface OnboardingCompleteData {
  userId: number;
  /** 성공 응답에서는 항상 true */
  onboardingCompleted: boolean;
  newlyCompleted: boolean;
}

export interface OnboardingCompleteResponse {
  success: boolean;
  data: OnboardingCompleteData;
}

/**
 * Request Body 없음. 이미 완료된 사용자도 200으로 내려오며, 분기는 success 키로만 판단한다.
 */
export async function completeUserOnboarding(
  userId: number
): Promise<OnboardingCompleteResponse> {
  try {
    const response = await api.patch<OnboardingCompleteResponse>(
      "/api/v1/users/me/onboarding",
      null,
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

// ===== 온보딩·동의 상태 + 프로필 조회 (ONB-01, MY-01) =====
// 앱이 시작될 때 가장 먼저 호출해 진입 화면(동의/온보딩/홈)을 결정하고, MY 탭 프로필 숫자도
// 같은 응답으로 채운다. 이 API는 다른 조회 API와 달리 status/message가 없다 — 신규 사용자도
// 전부 정상값(onboardingCompleted: false, streakCount: 0, level: 1 등)으로 내려오며, 빈 상태라는
// 개념 자체가 없다. 사용자가 아예 없을 때만 404.

export interface UserMeData {
  userId: number;
  nickname: string;
  onboardingCompleted: boolean;
  /**
   * "동의한 적이 있는가"가 아니라 "지금 활성화된 약관 버전(currentTermsVersion)에 동의했는가"다.
   * 서버가 약관을 개정해 currentTermsVersion을 올리면 이미 동의했던 사용자도 자동으로 다시
   * false가 된다 — 그래서 이 값을 기기 로컬(AsyncStorage 등)에 "동의 완료"로 영구 저장해 분기하면
   * 절대 안 된다(그러면 버전이 올라가도 앱이 영원히 모른다). 매 앱 시작마다 이 API를 새로 불러
   * 서버 값을 그대로 신뢰할 것.
   */
  consentAgreed: boolean;
  currentTermsVersion: string;
  /** 사용자가 실제로 동의를 제출한 버전 — consentAgreed:false면 currentTermsVersion과 다르거나, 동의 이력 자체가 없을 수 있다 */
  agreedTermsVersion: string;
  /** ISO 8601, UTC('Z') */
  agreedAt: string;
  /** 누적 셀피 검증 횟수 (MY-01) — GET /skin/model, GET /skin/verification/summary와 같은 개념의 값 */
  verificationCount: number;
  /** 연속 검증 횟수. baseDate 기준으로 계산되므로(GET /skin/verification/summary와 동일 규칙) baseDate 파라미터가 필수다 */
  streakCount: number;
  /** 1~5 */
  level: number;
  totalExp: number;
  /**
   * 다음 레벨 컷오프 절대값. 만렙(5레벨)이면 null — "남은 exp"가 아니므로 그대로 표시하지 말고
   * calculateRemainingExp(api/game.ts)로 totalExp와 함께 계산할 것. 만렙 이후에도 totalExp는
   * 계속 오르지만 화면에는 레벨을 그대로 "5"(만렙)로 표시하면 된다.
   */
  nextLevelExp: number | null;
}

export interface UserMeResponse {
  success: boolean;
  data: UserMeData;
}

/**
 * 온보딩·동의 상태 + 프로필 조회.
 * - baseDate: 앱의 로컬 "오늘" 날짜(YYYY-MM-DD). streakCount 계산에 필요(서버는 타임존을 모름 —
 *   UTC로 처리하면 한국 오전 9시 이전 호출에서 연속이 하루 밀린다).
 * - 이 API에는 빈 상태(NO_XXX 등)가 없다 — 신규 사용자도 항상 정상 200으로 기본값을 받는다.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → 다른 엔드포인트와 동일한 규칙으로
 *   SkinModelUserNotFoundError로 변환해 던진다. 그 외 에러는 원본 그대로 다시 던진다.
 */
export async function getUserMe(userId: number, baseDate: string): Promise<UserMeResponse> {
  try {
    const response = await api.get<UserMeResponse>("/api/v1/users/me", {
      params: { baseDate },
      headers: {
        "X-User-Id": userId,
      },
    });
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

export type VerificationTrustLevel = "초심자" | "믿을 만함" | "매우 신뢰함";

/**
 * verificationCount(누적 검증 횟수)로 MY 탭에 보여줄 신뢰도 문구를 매긴다. 서버는 이 해석을
 * 내려주지 않는다(컷오프를 서버에 두면 바꿀 때마다 배포해야 하므로) — skin.ts의
 * calculateModelReliability(내 모델 화면의 하/중/상 등급)와 같은 개념·같은 컷오프(5, 10)를
 * 재사용하되, MY 탭 문구에 맞는 라벨을 쓴다.
 */
export function calculateVerificationTrustLevel(count: number): VerificationTrustLevel {
  if (count >= 10) return "매우 신뢰함";
  if (count >= 5) return "믿을 만함";
  return "초심자";
}

// ===== 모든 기록 삭제 (MY-04, 회원 탈퇴) =====
// 🚨 soft delete가 아니라 행 자체를 지우는 완전 영구 삭제(hard delete)다 — 사용자와 함께 수면
// 세션, 단계 구간, 예보, 실측, 개인 가중치, TODO, exp 적립 이력, 동의 이력이 전부 사라지고
// 되살릴 방법이 없다(개인 가중치는 특히 셀피 검증을 처음부터 다시 반복해야만 재축적된다).
// action_master(사용자에 속하지 않는 마스터 데이터)만 지워지지 않는다.
//
// 서버는 요청을 받으면 확인 없이 즉시 지워버린다 — 되돌리는 경로가 없으므로, 사용자에게 확인받는
// 2단계 확인 다이얼로그(Double Check)는 100% 클라이언트(호출부)의 책임이다. 이 함수 자체는
// 확인 없이 바로 삭제를 실행하므로, 호출 전에 반드시 확인 UI를 거칠 것(my.tsx 참고).
//
// 응답은 204(No Content)가 아니라 다른 모든 API와 동일하게 200 + 공통 래퍼({ success, data })로
// 온다 — 이 API만 예외로 취급해 본문 없는 파싱을 하지 않도록 주의할 것.
//
// 멱등성 없음: 이미 삭제된 사용자로 다시 호출하면 404 USER_NOT_FOUND(다른 사용자 조회 실패와
// 동일한 에러 코드 — "존재하지 않음"과 "이미 삭제됨"을 서버가 구분해서 알려주지 않는다).

export interface DeleteUserMeData {
  userId: number;
  /** 성공 응답에서는 항상 true */
  deleted: boolean;
}

export interface DeleteUserMeResponse {
  success: boolean;
  data: DeleteUserMeData;
}

/**
 * 회원 탈퇴(모든 기록 영구 삭제). Request Body 없음.
 * - 400 USER_ID_HEADER_INVALID: X-User-Id 헤더 누락/형식 오류.
 * - 404 USER_NOT_FOUND: 존재하지 않거나(또는 이미 삭제된) 사용자 → 다른 엔드포인트와 동일한
 *   규칙으로 SkinModelUserNotFoundError로 변환해 던진다.
 */
export async function deleteUserMe(userId: number): Promise<DeleteUserMeResponse> {
  try {
    const response = await api.delete<DeleteUserMeResponse>("/api/v1/users/me", {
      headers: {
        "X-User-Id": userId,
      },
    });
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

// ===== 수면 데이터 연결 상태 (MY-02) =====
// 마지막으로 수면 데이터가 서버에 "도착한" 시각만 알려주는 아주 얇은 API. baseDate를 받지
// 않는다 — 날짜에 따라 달라지는 값이 이 응답엔 아예 없으므로(다른 대부분의 API와 달리) 쿼리
// 파라미터로 baseDate를 보내면 안 된다.
//
// 🚨 "마지막으로 잔 날"이 아니라 "마지막으로 받은(업로드된) 시각" 기준이다 — 며칠 전 수면을
// 방금 올렸다면 lastReceivedAt은 "지금"에 가깝다. 잔 날짜를 대신 썼다간 "동기화가 며칠째 안
// 됐다"고 잘못 말하게 된다. 화면은 "연결 상태"를 보여주는 것이므로 lastReceivedAt을 그대로 쓸 것.
//
// 서버가 알 수 없는(그래서 안 내려주는) 것 — 전부 클라이언트 몫:
// - HealthKit 권한이 살아있는지: 클라이언트 로컬 권한 상태라 서버가 볼 방법이 없다.
// - 다음 동기화가 언제인지: 서버 배치가 없고 "앱 시작 시 업로드"가 전부라, 주기 안내 문구는
//   프론트엔드가 실제 업로드 정책을 그대로 고정 텍스트로 노출해야 한다(my.tsx 참고).

/** 수신 이력이 있는 경우 */
export interface AvailableDataStatus {
  status: "AVAILABLE";
  message: null;
  /** ISO 8601, UTC('Z') — "마지막으로 잔 날"이 아니라 서버가 데이터를 받은 시각 */
  lastReceivedAt: string;
}

/**
 * 수신 이력이 전혀 없는 빈 상태 — 에러 아님, 200으로 내려온다. 아직 한 번도 앱을 켜지 않은
 * 신규 사용자에게 일상적으로 발생한다.
 */
export interface NoSleepDataDataStatus {
  status: "NO_SLEEP_DATA";
  message: string | null;
  lastReceivedAt: null;
}

/**
 * `status` 필드로만 분기할 것. `message`의 유무나 `lastReceivedAt`의 null 여부로 분기하지 말 것
 * (규칙: NO_SLEEP_DATA도 200 OK로 내려오며 에러가 아니다).
 */
export type DataStatusData = AvailableDataStatus | NoSleepDataDataStatus;

export interface DataStatusResponse {
  success: boolean;
  data: DataStatusData;
}

/**
 * 수면 데이터 연결 상태 조회. baseDate 없음(위 주석 참고) — X-User-Id 헤더만 보낸다.
 * - 200: NO_SLEEP_DATA(빈 상태)도 정상 응답이며 여기 포함된다.
 * - 404 USER_NOT_FOUND: 존재하지 않는 사용자 → 다른 엔드포인트와 동일한 규칙으로
 *   SkinModelUserNotFoundError로 변환해 던진다.
 */
export async function getDataStatus(userId: number): Promise<DataStatusResponse> {
  try {
    const response = await api.get<DataStatusResponse>("/api/v1/users/me/data-status", {
      headers: {
        "X-User-Id": userId,
      },
    });
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
