import axios from "axios";
import { useEffect } from "react";

import { api, terminateSession } from "../api/client";
import { type User, useAuthStore } from "../store/authStore";

let validationInFlight: Promise<void> | null = null;
let validationToken: string | null = null;

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
    return "The server is temporarily unavailable. Your session is preserved; please try again.";
  }
  return "We couldn't verify your session. Check your connection and try again.";
}

async function validatePersistedSession(token: string): Promise<void> {
  try {
    const { data } = await api.get<User>("/users/me");
    const state = useAuthStore.getState();
    if (state.bootstrapStatus !== "validating" || !state.accessToken) return;
    if (!isUserResponse(data)) {
      state.setBootstrapError("The server returned an invalid account response. Please try again.");
      return;
    }
    state.setValidatedUser(data);
  } catch (error: unknown) {
    const state = useAuthStore.getState();
    if (state.bootstrapStatus !== "validating" || !state.accessToken) return;

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const body = axios.isAxiosError(error)
      ? error.response?.data as { error?: string; detail?: string } | undefined
      : undefined;

    if (status === 401 || (status === 403 && body?.detail === "Account suspended")) {
      terminateSession(token);
      return;
    }
    if (status === 403 && body?.error === "onboarding_required" && state.user) {
      state.setValidatedUser({ ...state.user, onboarding_completed: false });
      return;
    }
    state.setBootstrapError(retryableMessage(status));
  }
}

function runValidation(token: string): Promise<void> {
  if (validationInFlight && validationToken === token) return validationInFlight;
  validationToken = token;
  const request = validatePersistedSession(token).finally(() => {
    if (validationInFlight === request) {
      validationInFlight = null;
      validationToken = null;
    }
  });
  validationInFlight = request;
  return request;
}

export function useAuthBootstrap() {
  const status = useAuthStore((state) => state.bootstrapStatus);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (status === "validating" && accessToken) {
      void runValidation(accessToken);
    }
  }, [accessToken, status]);
}
