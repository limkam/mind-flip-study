import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { router } from "expo-router";

import { useAuthStore } from "../store/authStore";
import { emitUpgradeLimit } from "../lib/upgradeLimitEvents";
import { clearMobileQueryCache } from "../lib/queryClient";

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
const NO_TERMINATED_TOKEN = Symbol("no-terminated-token");
let lastTerminatedToken: string | null | typeof NO_TERMINATED_TOKEN = NO_TERMINATED_TOKEN;

export function terminateSession(accessToken: string | null) {
  if (lastTerminatedToken === accessToken) return;
  lastTerminatedToken = accessToken;
  clearMobileQueryCache();
  useAuthStore.getState().terminateAuthSession();
  router.replace("/(auth)/login");
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original) return Promise.reject(error);

    const onboardingRequired =
      error.response?.status === 403
      && (error.response?.data as { error?: string } | undefined)?.error === "onboarding_required";
    if (
      onboardingRequired
      && !original.url?.includes("/auth/onboarding")
      && !original.url?.includes("/users/me")
    ) {
      router.replace("/onboarding");
      return Promise.reject(error);
    }

    if (
      error.response?.status === 402
      && !original.url?.includes("/billing/checkout")
    ) {
      const detail = error.response?.data as { detail?: { message?: string } | string } | undefined;
      const reason = typeof detail?.detail === "object" && detail.detail?.message
        ? detail.detail.message
        : "You reached a limit on your current plan.";
      (error as AxiosError & { isPlanLimitError?: boolean }).isPlanLimitError = true;
      emitUpgradeLimit({ reason });
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    if (original.url?.includes("/auth/refresh")) {
      terminateSession(useAuthStore.getState().accessToken);
      return Promise.reject(error);
    }
    original._retry = true;
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then(() => api(original));
    }
    isRefreshing = true;
    const refreshingAccessToken = useAuthStore.getState().accessToken;
    try {
      const { data } = await api.post<{ access_token: string }>("/auth/refresh");
      useAuthStore.getState().setAccessToken(data.access_token);
      queue.forEach(({ resolve }) => resolve());
      queue.length = 0;
      return api(original);
    } catch (e) {
      queue.forEach(({ reject }) => reject(e));
      queue.length = 0;
      terminateSession(refreshingAccessToken);
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  },
);
