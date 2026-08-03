import NetInfo from "@react-native-community/netinfo";
import axios from "axios";

import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import type { StudyProgressInput, StudyProgressOut } from "../types/api";
import { getApiErrorMessage } from "./apiErrors";

export type StudyProgressSubmissionResult =
  | { status: "submitted"; progress: StudyProgressOut }
  | { status: "queued" }
  | { status: "rejected"; reason: string; httpStatus?: number; retryable: boolean }
  | { status: "authentication"; reason: string; httpStatus?: number };

type EnqueueProgress = (input: StudyProgressInput) => Promise<boolean>;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStudyProgressOut(value: unknown): value is StudyProgressOut {
  if (!value || typeof value !== "object") return false;
  const progress = value as Record<string, unknown>;
  const events = progress.celebration_events;
  return typeof progress.id === "string"
    && typeof progress.card_id === "string"
    && typeof progress.ease_factor === "number"
    && typeof progress.interval_days === "number"
    && typeof progress.repetitions === "number"
    && isNullableString(progress.next_review_date)
    && isNullableString(progress.last_reviewed_at)
    && typeof progress.times_correct === "number"
    && typeof progress.times_incorrect === "number"
    && Array.isArray(events)
    && events.every((event) => {
      if (!event || typeof event !== "object") return false;
      const item = event as Record<string, unknown>;
      return typeof item.event_id === "string"
        && typeof item.event_type === "string"
        && typeof item.occurred_at === "string"
        && isNullableString(item.entity_id)
        && isNullableString(item.title)
        && isNullableString(item.message)
        && !!item.metadata
        && typeof item.metadata === "object"
        && !Array.isArray(item.metadata);
    });
}

async function queueRetryable(
  input: StudyProgressInput,
  enqueue: EnqueueProgress | undefined,
  reason: string,
  httpStatus?: number,
): Promise<StudyProgressSubmissionResult> {
  if (!enqueue) return { status: "rejected", reason, httpStatus, retryable: true };
  try {
    const accepted = await enqueue(input);
    return accepted
      ? { status: "queued" }
      : { status: "rejected", reason: "Progress could not be saved for later.", retryable: true };
  } catch {
    return { status: "rejected", reason: "Progress could not be saved for later.", retryable: true };
  }
}

export async function submitStudyProgress(
  input: StudyProgressInput,
  enqueue?: EnqueueProgress,
): Promise<StudyProgressSubmissionResult> {
  try {
    const network = await NetInfo.fetch();
    if (network.isConnected !== true || network.isInternetReachable === false) {
      return queueRetryable(input, enqueue, "The device is offline.");
    }
  } catch {
    // If connectivity cannot be determined, let Axios make the authoritative attempt.
  }

  try {
    const { data } = await api.post<unknown>("/study/progress", input);
    if (!isStudyProgressOut(data)) {
      return {
        status: "rejected",
        reason: "The server returned an invalid progress response.",
        retryable: false,
      };
    }
    return { status: "submitted", progress: data };
  } catch (error: unknown) {
    const httpStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    const reason = getApiErrorMessage(error, "Progress could not be saved.");
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

    if (retryable) return queueRetryable(input, enqueue, reason, httpStatus);
    return { status: "rejected", reason, httpStatus, retryable: false };
  }
}
