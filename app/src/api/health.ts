import { api } from "@/api/axios";

export interface HealthCheckData {
  status: string;
  applicationName: string;
  serverTime: string;
}

export interface HealthCheckResponse {
  success: boolean;
  data: HealthCheckData;
}

export async function checkHealth(): Promise<HealthCheckResponse> {
  const response = await api.get<HealthCheckResponse>("/api/v1/health");
  return response.data;
}
