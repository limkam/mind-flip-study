import axios from "axios";
import { useEffect } from "react";

import { api, terminateSession } from "../api/client";
import { clearNativeRefreshToken, getNativeRefreshToken, setNativeRefreshToken } from "../lib/nativeSession";
import { type User, useAuthStore } from "../store/authStore";

let validationInFlight: Promise<void> | null = null;

function isUserResponse(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<User>;
  return (
    typeof user.id === "string"
    && typeof user.email === "string"
    && typeof user.full_name === "string"
    && (user.role === "admin" || user.role === "student")
    && typeof user.onboarding_completed === "boolean"
  );
}

function retryableMessage(status?: number) {
  if (status && status >= 500) {
    return "Bilkeys is temporarily unavailable. You're still signed in; please try again.";
  }
  return "We couldn't restore your sign-in. Check your connection and try again.";
}

async function runBootstrapSessionValidation(): Promise<void> {
  const state = useAuthStore.getState();
  const initialGen = state.authGeneration;

  const refreshToken = await getNativeRefreshToken();
  if (!refreshToken) {
    state.logout();
    return;
  }

  try {
    // 1. Post to native refresh endpoint
    const refreshRes = await api.post<{ access_token: string; refresh_token?: string }>("/auth/refresh", {
      refresh_token: refreshToken,
    });

    if (useAuthStore.getState().authGeneration !== initialGen) {
      return; // Account switch or logout occurred during async call
    }

    if (refreshRes.data.refresh_token) {
      const keepSignedIn = useAuthStore.getState().keepSignedIn;
      const written = await setNativeRefreshToken(refreshRes.data.refresh_token, { persistent: keepSignedIn });
      if (!written) {
        await clearNativeRefreshToken();
        terminateSession(null);
        return;
      }
    }

    if (useAuthStore.getState().authGeneration !== initialGen) {
      return;
    }

    useAuthStore.getState().setAccessToken(refreshRes.data.access_token);

    // 2. Hydrate user with /users/me
    const { data: userData } = await api.get<User>("/users/me");

    if (useAuthStore.getState().authGeneration !== initialGen) {
      return;
    }

    if (!isUserResponse(userData)) {
      useAuthStore.getState().setBootstrapError("We couldn't load your account. Please try again.");
      return;
    }

    useAuthStore.getState().setValidatedUser(userData);
  } catch (error: unknown) {
    if (useAuthStore.getState().authGeneration !== initialGen) return;

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const body = axios.isAxiosError(error)
      ? error.response?.data as { error?: string; detail?: string } | undefined
      : undefined;

    const isTerminal =
      status === 400 ||
      status === 401 ||
      (status === 403 && body?.detail === "Account suspended") ||
      status === 422;

    if (isTerminal) {
      await clearNativeRefreshToken();
      terminateSession(null);
      return;
    }

    if (status === 403 && body?.error === "onboarding_required" && state.user) {
      state.setValidatedUser({ ...state.user, onboarding_completed: false });
      return;
    }

    useAuthStore.getState().setBootstrapError(retryableMessage(status));
  }
}

function runValidation(): Promise<void> {
  if (validationInFlight) return validationInFlight;
  const request = runBootstrapSessionValidation().finally(() => {
    if (validationInFlight === request) {
      validationInFlight = null;
    }
  });
  validationInFlight = request;
  return request;
}

export function useAuthBootstrap() {
  const status = useAuthStore((state) => state.bootstrapStatus);

  useEffect(() => {
    if (status === "validating") {
      void runValidation();
    }
  }, [status]);
}
