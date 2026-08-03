import axios from "axios";

import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import type { CelebrationEventOut, QuizResultInput, QuizResultOut } from "../types/api";
import { getApiErrorMessage } from "./apiErrors";

export type QuizResultSubmissionResult =
  | { status: "submitted"; result: QuizResultOut }
  | { status: "rejected"; reason: string; httpStatus?: number; retryable: boolean }
  | { status: "authentication"; reason: string; httpStatus?: number };

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCelebrationEvent(value: unknown): value is CelebrationEventOut {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.event_id === "string"
    && typeof event.event_type === "string"
    && typeof event.occurred_at === "string"
    && isNullableString(event.entity_id)
    && isNullableString(event.title)
    && isNullableString(event.message)
    && !!event.metadata
    && typeof event.metadata === "object"
    && !Array.isArray(event.metadata);
}

function isQuizResultOut(value: unknown): value is QuizResultOut {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return typeof result.id === "string"
    && typeof result.user_id === "string"
    && typeof result.set_id === "string"
    && typeof result.score === "number"
    && typeof result.total_questions === "number"
    && typeof result.time_taken_seconds === "number"
    && typeof result.completed_at === "string"
    && !!result.extras
    && typeof result.extras === "object"
    && !Array.isArray(result.extras)
    && isNullableString(result.flashcard_set_id)
    && (result.percentage === null || typeof result.percentage === "number")
    && isNullableString(result.player_email)
    && isNullableString(result.player_name)
    && isNullableString(result.set_title)
    && isNullableString(result.book_title)
    && Array.isArray(result.celebration_events)
    && result.celebration_events.every(isCelebrationEvent);
}

export async function submitQuizResult(
  input: QuizResultInput,
): Promise<QuizResultSubmissionResult> {
  const requestingUserId = useAuthStore.getState().user?.id;
  if (!requestingUserId || !useAuthStore.getState().accessToken) {
    return { status: "authentication", reason: "Sign in again to save your result." };
  }
  try {
    const { data } = await api.post<unknown>("/quiz-results/", input);
    if (!isQuizResultOut(data)) {
      return {
        status: "rejected",
        reason: "The server returned an invalid quiz result.",
        retryable: false,
      };
    }
    if (
      !data.id
      || data.user_id !== requestingUserId
      || data.set_id !== input.set_id
      || data.score !== input.score
      || data.total_questions !== input.total_questions
      || data.time_taken_seconds !== input.time_taken_seconds
    ) {
      return {
        status: "rejected",
        reason: "The saved result did not match this game attempt.",
        retryable: false,
      };
    }
    return { status: "submitted", result: data };
  } catch (error: unknown) {
    const httpStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    const reason = getApiErrorMessage(error, "Your result could not be saved.");
    const auth = useAuthStore.getState();
    if (httpStatus === 401 || !auth.accessToken || auth.bootstrapStatus === "terminated") {
      return { status: "authentication", reason, httpStatus };
    }
    const timeout = axios.isAxiosError(error)
      && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT");
    const noResponse = axios.isAxiosError(error) && !error.response;
    const retryable = timeout
      || noResponse
      || httpStatus === 408
      || httpStatus === 429
      || (httpStatus !== undefined && httpStatus >= 500 && httpStatus <= 599);
    return { status: "rejected", reason, httpStatus, retryable };
  }
}
