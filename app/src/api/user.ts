import { api } from "@/api/axios";

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
}
