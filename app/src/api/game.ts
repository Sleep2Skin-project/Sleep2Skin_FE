import { AxiosError } from "axios";

import { api } from "@/api/axios";
import { ApiErrorBody, SkinModelUserNotFoundError } from "@/api/skin";
import type { UserMeData } from "@/api/user";
import { LEVEL_EXP_MAX } from "@/constants/mockData";

// ===== 출석 체크인 (HOME-04) =====
// 앱 시작 시 한 번 호출한다. 하루 여러 번(스플래시+홈 등) 불러도 중복 지급되지 않으며,
// 서버는 에러(409)가 아니라 항상 200 OK로 응답한다 — 그날 첫 호출인지 여부는 응답의
// checkedIn으로만 구분한다.

/** exp.reasons[].reason — 지금은 "VERIFICATION_STREAK" 하나만 확인됨. 서버가 사유를 늘릴 수 있어 string으로 열어둔다. */
export interface AttendanceExpGainReason {
  reason: string;
  amount: number;
}

export interface AttendanceExpInfo {
  /** 이번 호출로 받은 경험치. 그날 재호출이면 0 */
  gained: number;
  reasons: AttendanceExpGainReason[];
  totalExp: number;
  /** 저장 컬럼이 아니라 totalExp에서 계산되는 값. 캐릭터 이름/이미지는 응답에 없어 프론트 리소스로 매핑한다 */
  level: number;
  /** true면 캐릭터 변경 연출을 띄우라는 신호 */
  levelUp: boolean;
  /** 다음 레벨 컷오프 절대값(총량). 만렙(5레벨)이면 null — "남은 경험치"가 아니므로 그대로 표시하지 말 것 */
  nextLevelExp: number | null;
}

export type AttendanceDayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

/**
 * ATTENDED: 그날 출석 기록이 있다(재호출이어도 오늘 칸은 여기). MISSED: 이미 지난 날인데 기록이
 * 없다. UPCOMING: baseDate보다 미래라 아직 판정할 수 없다 — MISSED와 같은 빈 칸으로 그리면 안
 * 된다(하지도 않은 일로 도장판이 비어 보이는 오탐).
 */
export type AttendanceDayStatus = "ATTENDED" | "MISSED" | "UPCOMING";

export interface AttendanceWeekDay {
  /** "YYYY-MM-DD" */
  date: string;
  dayOfWeek: AttendanceDayOfWeek;
  status: AttendanceDayStatus;
}

export interface AttendanceCheckInData {
  baseDate: string;
  /**
   * 그날 첫 호출만 true(+exp 지급). 같은 날 재호출은 false이며 exp.gained도 0 —
   * 홈 화면의 출석 완료 팝업은 이 값이 true일 때만 띄운다.
   */
  checkedIn: boolean;
  /**
   * 출석 연속 횟수가 아니라 '연속 검증 횟수'다(GET /skin/verification/summary, MY 탭과 동일한 값).
   * 연속 검증 자체에 대한 보상은 이 API가 아니라 POST /skin/selfie가 지급한다. 요일별 출석
   * 도장판(weekDays)을 이 값으로 역산해서 그리지 말 것 — 개념이 다른 숫자다(과거 실수 참고:
   * attendance-flow.tsx가 한때 이 값을 week-streak.ts로 투영해 첫 출석일에도 X로 보이는
   * 버그가 있었다).
   */
  streakCount: number;
  exp: AttendanceExpInfo;
  /** 기준일이 속한 주의 월요일("YYYY-MM-DD") — REP-06 주간 리포트의 롤링 7일 앵커와 다르므로 같은 규칙으로 읽지 말 것 */
  weekStartDate: string;
  /** 항상 월~일 7칸(기록 없는 날도 빠지지 않음), 첫 칸이 월요일 고정. 도장판은 이 값을 그대로 그린다 */
  weekDays: AttendanceWeekDay[];
}

export interface AttendanceCheckInResponse {
  success: boolean;
  data: AttendanceCheckInData;
}

/**
 * 출석 체크인(HOME-04). Request Body 없음 — 상태를 만드는 동작(POST)이지만 baseDate만 필요해
 * 쿼리 파라미터로만 보낸다.
 * - baseDate: 앱의 로컬 "오늘" 날짜(YYYY-MM-DD). 서버는 타임존을 모르므로 UTC로 처리하면
 *   한국 시간 오전 9시 이전 호출이 어제 날짜로 찍힌다 — 반드시 클라이언트가 계산해 보낸다.
 * - 재호출: 하루에 여러 번 호출해도 항상 200 OK. 409로 막지 않는다(정상 흐름을 에러로 만들지
 *   않기 위함) — 팝업 여부는 응답의 checkedIn으로 분기할 것.
 * - 400 INVALID_INPUT / USER_ID_HEADER_INVALID, 404 USER_NOT_FOUND는 그대로 흐르되, 404만
 *   다른 엔드포인트와 동일한 규칙으로 SkinModelUserNotFoundError로 변환해 던진다.
 */
export async function checkInAttendance(
  userId: number,
  baseDate: string
): Promise<AttendanceCheckInResponse> {
  try {
    const response = await api.post<AttendanceCheckInResponse>(
      "/api/v1/users/me/attendance",
      null,
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

/**
 * 레벨/exp를 내려주는 모든 API(HOME-04 출석체크, TODO-05 상태 변경, GET /users/me 프로필 등)가
 * 공통으로 갖는 최소 필드 — calculateRemainingExp가 실제로 쓰는 값만 뽑은 구조적 타입이다.
 * AttendanceExpInfo와 GET /users/me의 UserMeData(api/user.ts) 둘 다 이 모양을 이미 만족하므로
 * 별도 변환 없이 그대로 넘길 수 있다.
 */
export interface LevelProgress {
  totalExp: number;
  /** 다음 레벨 컷오프 절대값(총량). 만렙이면 null */
  nextLevelExp: number | null;
}

/**
 * 다음 레벨까지 남은 경험치. 서버는 "남은 경험치"가 아니라 다음 레벨 컷오프 절대값(nextLevelExp)만
 * 내려주므로 nextLevelExp - totalExp로 앱이 직접 계산한다.
 * 만렙(nextLevelExp === null)이면 계산할 다음 컷오프가 없으므로 null을 반환한다 — 호출부는 이
 * null을 반드시 "만렙" 상태로 방어 처리할 것(0으로 취급하거나 그대로 빼면 안 됨).
 */
export function calculateRemainingExp(exp: LevelProgress): number | null {
  if (exp.nextLevelExp === null) return null;
  return exp.nextLevelExp - exp.totalExp;
}

/**
 * "이번 레벨 안에서 current/max exp" 형태로 환산 — 서버는 totalExp(누적)와 nextLevelExp(다음
 * 레벨 컷오프 절대값)만 주므로, LEVEL_EXP_MAX(레벨별 필요 exp 표)로 "이번 레벨 시작 exp"를
 * 역산한다. 홈 화면(index.tsx)의 exp 게이지와 마이 탭(my.tsx)의 레벨 바 둘 다 이 함수 하나를
 * 공유해서 써야 두 화면의 진행률이 항상 같은 값으로 일치한다.
 * 만렙(nextLevelExp === null)이거나 profile 자체가 없으면(로딩 중) 꽉 찬 값(percent:100)으로
 * 방어한다.
 */
export function getLevelExpDisplay(
  profile: UserMeData | null
): { current: number; max: number; percent: number } {
  const level = profile?.level ?? 1;
  const max = LEVEL_EXP_MAX[level] ?? LEVEL_EXP_MAX[1];
  if (!profile || profile.nextLevelExp === null) {
    return { current: max, max, percent: 100 };
  }
  const levelStartExp = profile.nextLevelExp - max;
  const current = Math.min(Math.max(profile.totalExp - levelStartExp, 0), max);
  return { current, max, percent: (current / max) * 100 };
}
