import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { router } from "expo-router";

import { useAuthStore } from "../store/authStore";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Mirrors the web SPA client: Bearer access token + refresh on 401.
 * Note: refresh uses an httpOnly cookie on web; on native, cookie handling depends on the stack.
 */
export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
const queue: Array<{ resolve: (v?: unknown) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original) return Promise.reject(error);

    const onboardingRequired =
      error.response?.status === 403
      && (error.response?.data as { error?: string } | undefined)?.error === "onboarding_required";
    if (onboardingRequired && !original.url?.includes("/auth/onboarding")) {
      router.replace("/onboarding");
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    if (original.url?.includes("/auth/refresh")) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }
    original._retry = true;
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then(() => api(original));
    }
    isRefreshing = true;
    try {
      const { data } = await api.post<{ access_token: string }>("/auth/refresh");
      useAuthStore.getState().setAccessToken(data.access_token);
      queue.forEach(({ resolve }) => resolve());
      queue.length = 0;
      return api(original);
    } catch (e) {
      queue.forEach(({ reject }) => reject(e));
      queue.length = 0;
      useAuthStore.getState().logout();
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  },
);
