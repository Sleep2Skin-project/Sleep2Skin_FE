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
