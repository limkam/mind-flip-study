import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { router } from "expo-router";

import { useAuthStore } from "../store/authStore";
import { emitUpgradeLimit } from "../lib/upgradeLimitEvents";
import { clearMobileQueryCache } from "../lib/queryClient";
import { safeReturnRoute } from "../lib/returnRoute";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

let currentRoutePath: string | null = null;

/**
 * Route listener bridge to record the active route pathname for non-React modules.
 */
export function setNavigationRouteBridge(pathname: string | null | undefined) {
  const safe = safeReturnRoute(pathname);
  currentRoutePath = safe;
}

/**
 * Pure predicate for authenticating endpoints that legitimately return 401
 * and should NOT trigger token refresh or refresh-queueing.
 *
 * Handles relative and absolute URLs, strips protocol/origin/API prefix,
 * query strings, hashes, and normalizes trailing slashes.
 */
export function isAuthEndpoint(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;

  // Extract path from absolute or relative URL
  let path = url;
  if (path.includes("://")) {
    try {
      path = new URL(path).pathname;
    } catch {
      path = path.split("://")[1] || path;
      const firstSlash = path.indexOf("/");
      path = firstSlash !== -1 ? path.slice(firstSlash) : path;
    }
  }

  // Strip query strings and hash
  path = path.split("?")[0].split("#")[0];

  // Strip trailing slashes
  path = path.replace(/\/+$/, "");

  // Match exact backend auth endpoints
  const AUTH_PATHS = new Set([
    "/auth/refresh",
    "/auth/email/start",
    "/auth/email/verify",
    "/auth/google",
    "/auth/apple",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/logout",
    "/auth/onboarding",
  ]);

  return AUTH_PATHS.has(path);
}

/**
 * Mirrors the web SPA client: Bearer access token + refresh on 401.
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
      const validReturn = safeReturnRoute(currentRoutePath);
      if (validReturn) {
        router.replace({
          pathname: "/onboarding",
          params: { returnTo: validReturn },
        });
      } else {
        router.replace("/onboarding");
      }
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

    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Excluded authentication endpoints: reject immediately without calling refresh
    if (isAuthEndpoint(original.url)) {
      if (original.url?.includes("/auth/refresh")) {
        terminateSession(useAuthStore.getState().accessToken);
      }
      return Promise.reject(error);
    }

    if (original._retry) {
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
