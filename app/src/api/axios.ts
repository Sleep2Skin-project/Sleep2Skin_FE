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
        console.error(
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
