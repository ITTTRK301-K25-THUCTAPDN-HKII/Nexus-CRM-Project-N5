import axios, { type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retriedAfterRefresh?: boolean;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let refreshRequest: Promise<void> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const config = error.config as InternalAxiosRequestConfig | undefined;
    const url = config?.url ?? '';
    const excluded = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password'];
    if (error.response?.status !== 401 || !config || config._retriedAfterRefresh || excluded.includes(url)) {
      return Promise.reject(error);
    }

    config._retriedAfterRefresh = true;
    try {
      if (!refreshRequest) {
        refreshRequest = api.post('/auth/refresh').then(() => undefined).finally(() => {
          refreshRequest = null;
        });
      }
      await refreshRequest;
      return api.request(config);
    } catch (refreshError) {
      if (window.location.pathname !== '/login') window.location.assign('/login');
      return Promise.reject(refreshError);
    }
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  }
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
