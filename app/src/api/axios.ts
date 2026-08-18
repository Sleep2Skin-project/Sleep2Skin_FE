import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL = "https://sleep2skin.duckdns.org";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (__DEV__) {
      console.log(
        `[API Request] ${config.method?.toUpperCase()} ${config.baseURL ?? ""}${config.url}`,
        config.data ?? ""
      );
    }
    return config;
  },
  (error: AxiosError) => {
    if (__DEV__) {
      console.error("[API Request Error]", error.message);
    }
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(
        `[API Response] ${response.status} ${response.config.url}`,
        response.data
      );
    }
    return response;
  },
  (error: AxiosError) => {
    if (__DEV__) {
      if (error.response) {
        // 4xx는 서버가 정상적으로 판정한 비즈니스 에러(예: 409 VERIFICATION_ALREADY_DONE)라
        // 호출부가 이미 코드별로 분기해 사용자에게 안내한다(예: selfie-verification-flow.tsx의
        // handleVerifyError) — console.error로 찍으면 RN LogBox가 그 위에 빨간 에러 화면을
        // 띄워버려서, 이미 처리된 정상 흐름인데도 앱이 멈춘 것처럼 보인다. 5xx/그 외는 예기치
        // 못한 실패이므로 그대로 console.error 유지.
        const log = error.response.status < 500 ? console.warn : console.error;
        log(
          `[API Response Error] ${error.response.status} ${error.config?.url}`,
          error.response.data
        );
      } else if (error.request) {
        console.error(
          `[API No Response] ${error.config?.url}`,
          error.message
        );
      } else {
        console.error("[API Setup Error]", error.message);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
