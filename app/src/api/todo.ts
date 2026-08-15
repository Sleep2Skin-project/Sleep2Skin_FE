import { AxiosError } from "axios";

import { api } from "@/api/axios";
import type { AttendanceExpInfo } from "@/api/game";
import { ApiErrorBody, SkinModelUserNotFoundError } from "@/api/skin";

// ===== 오늘의 TODO 목록 (TODO-02~05) =====
// "오늘은 피하세요"(avoidItems)와 "오늘 밤 체크리스트"(checklistItems)를 한 번에 내려주는 API.
//
// 🚨 두 배열은 필드가 서로 다르다 — 절대 같은 모양으로 취급하지 말 것(JSON 예시는 우연히 같은
// 모양으로 보일 수 있으나 텍스트 명세가 우선):
// - avoidItems: causeLabel(원인 태그) + reason(롱프레스 노출용 긴 설명)을 가진다. status 없음
//   (체크박스로 체크하는 항목이 아니다).
// - checklistItems: status("PENDING" | "DONE")만 가진다. causeLabel/reason 없음.
//
// TODO-01(최상단 요약 멘트)은 서버가 만들어주지 않는다 — "오늘의 피부를 위한 미션" 같은 문구는
// 프론트엔드가 데이터 유무(아래 status와 배열의 비어있음 여부)에 따라 직접 결정해서 렌더링할 것.

export interface TodoAvoidItem {
  id: number;
  category: string;
  title: string;
  /** 원인 태그 — 체크박스 대신 이 태그를 보여준다 */
  causeLabel: string;
  /** 롱프레스 시에만 노출하는 긴 설명 */
  reason: string;
}

export interface TodoChecklistItem {
  id: number;
  category: string;
  title: string;
  /** 진행도("n/5")는 서버가 계산해 주지 않는다 — 이 배열을 순회하며 DONE 개수를 프론트가 직접 센다 */
  status: "PENDING" | "DONE";
}

/** 정상적으로 데이터가 있는 경우 — avoidItems/checklistItems가 둘 다 비어 있을 수도 있다(아래 참고) */
export interface AvailableDailyTodoData {
  status: "AVAILABLE";
  message: string | null;
  baseDate: string;
  /** 상위 최대 3개 */
  avoidItems: TodoAvoidItem[];
  /** 상위 최대 5개 */
  checklistItems: TodoChecklistItem[];
}

/**
 * 2가지 빈 상태를 절대 같은 것으로 취급하지 말 것 — 문구도 서로 완전히 달라야 한다:
 * - NO_SLEEP_DATA(이 타입): 예보 자체가 없는 신규 유저. "수면 데이터를 동기화해주세요" 같은 안내.
 * - AVAILABLE인데 avoidItems/checklistItems가 둘 다 []: 그날 처방할 게 없을 만큼 지표가
 *   좋은 경우. "오늘은 특별히 관리할 항목이 없어요! 완벽합니다!" 같은 축하 문구.
 * 분기는 반드시 `status` 필드로 할 것 — message의 유무나 내용으로 분기하지 말 것.
 */
export interface NoSleepDataDailyTodoData {
  status: "NO_SLEEP_DATA";
  message: string | null;
  baseDate: string;
  avoidItems: TodoAvoidItem[];
  checklistItems: TodoChecklistItem[];
}

export type DailyTodoData = AvailableDailyTodoData | NoSleepDataDailyTodoData;

export interface DailyTodoResponse {
  success: boolean;
  data: DailyTodoData;
}

/**
 * 오늘의 TODO 목록(오늘은 피하세요 + 오늘 밤 체크리스트) 조회.
 * - baseDate: 기상일 기준 "YYYY-MM-DD". 필수 쿼리 파라미터.
 * - 200: NO_SLEEP_DATA(빈 상태)와 AVAILABLE+빈 배열(처방할 게 없는 날) 둘 다 정상 응답이며
 *   여기 포함된다 — 서로 다른 상태이니 호출부에서 반드시 구분해서 렌더링할 것.
 * - 400 INVALID_INPUT / USER_ID_HEADER_INVALID, 404 USER_NOT_FOUND(SkinModelUserNotFoundError로 변환)는
 *   다른 엔드포인트와 동일 규칙.
 */
export async function getDailyTodos(
  baseDate: string,
  userId: number
): Promise<DailyTodoResponse> {
  try {
    const response = await api.get<DailyTodoResponse>("/api/v1/todo", {
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

// ===== TODO 항목 상태 변경 (TODO-05) =====
// 체크리스트(checklistItems) 항목만 대상이다 — avoidItems는 완료 개념이 없어 그 id로 요청하면
// 400 ACTION_NOT_CHECKABLE. UI에서도 avoidItems에는 애초에 체크박스를 두지 않는다(todo.tsx).
//
// 🚨 exp 증감/회수(어뷰징 방지) 완벽 규칙 — 상태가 "실제로" 바뀔 때만 exp가 움직인다:
// - PENDING → DONE: +5 (TODO_DONE)
// - PENDING → DONE(그날 마지막 하나): +35 (TODO_DONE + TODO_ALL_DONE)
// - DONE → PENDING(되돌리기): -5 (TODO_DONE) — 반드시 마이너스 gained가 올 수 있음을 UI가 처리할 것
// - DONE → PENDING(직전까지 전부 완료였다면): -35 (TODO_DONE + TODO_ALL_DONE)
// - 같은 상태로 재요청(멱등): gained 0, reasons: []
// - 누적 exp는 0 밑으로 내려가지 않으므로, 0 근처에서 되돌리면 요청한 양(-5/-35)보다 작은 값이
//   담길 수 있다 — 프론트에서 "당연히 -5/-35겠지"라고 값을 미리 계산하지 말고 응답의 gained를
//   그대로 믿을 것.

/**
 * exp 객체는 HOME-04(출석 체크인) 등 다른 게이미케이션 API와 완전히 같은 모양이다 — 여기서
 * 새 타입을 만들지 않고 api/game.ts의 AttendanceExpInfo를 그대로 재사용한다(파싱 코드·레벨업
 * 연출을 중복 구현하지 않기 위함, components/exp-gain-popup.tsx가 이 타입을 공유해서 쓴다).
 */
export interface TodoStatusUpdateData {
  id: number;
  status: "PENDING" | "DONE";
  /**
   * "이번 요청으로 전체 완료가 됐는가"가 아니라 "지금 그날 DO(checklistItems)가 전부 DONE인가"를
   * 뜻하는 현재 상태값이다. 방금 전부 완료(또는 완료 해제)됐는지는 exp.reasons에 TODO_ALL_DONE이
   * 있는지로 판단할 것. avoidItems는 이 판정 대상에서 아예 빠진다(체크 대상이 아니므로).
   */
  allCompleted: boolean;
  exp: AttendanceExpInfo;
}

export interface TodoStatusUpdateResponse {
  success: boolean;
  data: TodoStatusUpdateData;
}

export type TodoActionErrorCode =
  | "ACTION_NOT_CHECKABLE"
  | "INVALID_INPUT"
  | "TODO_NOT_FOUND"
  | "USER_NOT_FOUND";

/**
 * PATCH /api/v1/todo/{id}가 에러 코드와 함께 실패했을 때 던지는 에러. 호출부는 `error.code`로
 * 분기할 것 — 특히 TODO_NOT_FOUND는 "존재하지 않는 항목"과 "남의 항목이라 403을 줘야 하는 경우"를
 * 서버가 일부러 구분 없이 합친 것이다(id 존재 여부가 새어나가지 않도록 하는 보안 처리) — 프론트도
 * 이 둘을 구분하려 하지 말고 그냥 "해당 항목을 찾을 수 없음"으로 동일하게 처리할 것.
 */
export class TodoActionApiError extends Error {
  readonly code: TodoActionErrorCode;
  readonly status: number;

  constructor(code: TodoActionErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "TodoActionApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 체크리스트 항목 상태 변경(PENDING ↔ DONE). Request Body: { status }.
 * - id: daily_todo PK(경로 파라미터).
 * - 400 ACTION_NOT_CHECKABLE: avoidItems id로 요청함. 400 INVALID_INPUT: status 값 오류.
 * - 404 TODO_NOT_FOUND: 존재하지 않거나 남의 항목(보안상 403 대신 404로 통일). 404 USER_NOT_FOUND:
 *   존재하지 않는 사용자.
 * - 위 4개 코드 모두 TodoActionApiError로 변환해 던진다(다른 엔드포인트의 단일 404 변환과 달리,
 *   호출부가 코드별로 다르게 처리해야 해서 SkinModelUserNotFoundError로 뭉뚱그리지 않는다).
 */
export async function updateTodoStatus(
  id: number,
  status: "PENDING" | "DONE",
  userId: number
): Promise<TodoStatusUpdateResponse> {
  try {
    const response = await api.patch<TodoStatusUpdateResponse>(
      `/api/v1/todo/${id}`,
      { status },
      {
        headers: {
          "X-User-Id": userId,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      const body = error.response.data as ApiErrorBody | undefined;
      const code = body?.code as TodoActionErrorCode | undefined;
      if (code) {
        throw new TodoActionApiError(code, error.response.status, body?.message);
      }
    }
    throw error;
  }
}
