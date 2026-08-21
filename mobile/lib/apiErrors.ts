import axios, { type AxiosError } from "axios";

function formatDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "object" && item !== null && "msg" in item) {
        return String((item as { msg: string }).msg);
      }
      return JSON.stringify(item);
    });
    return parts.filter(Boolean).join("; ");
  }
  if (typeof detail === "object" && detail !== null) {
    if ("message" in detail) {
      return String((detail as { message: string }).message);
    }
    if ("msg" in detail) {
      return String((detail as { msg: string }).msg);
    }
  }
  return JSON.stringify(detail);
}

function exposesImplementationDetail(message: string): boolean {
  return /\b(api|backend|cache|database|dto|endpoint|http|payload|query|response|router|server|session[_ ]?id|status code|stripe|token|traceback)\b|\/(?:\(tabs\)|auth|billing)\b|\b[45]\d{2}\b/i.test(message);
}

/** Human-readable message from axios/FastAPI responses (handles validation arrays). */
export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && !exposesImplementationDetail(error.message)
      ? error.message
      : fallback;
  }

  const ax = error as AxiosError<{ detail?: unknown }>;
  const fromBody = formatDetail(ax.response?.data?.detail);
  const exposesImplementation = fromBody ? exposesImplementationDetail(fromBody) : false;
  if (fromBody && !exposesImplementation) return fromBody;

  const status = ax.response?.status;
  if (status === 429) return "Too many attempts. Try again in a minute.";
  if (status === 401) return "Your sign-in has expired. Please sign in again.";
  if (status === 403) return "This action isn't available for your account.";
  if (status === 404) return "This item is no longer available.";
  if (status && status >= 500) return "Bilkeys is having trouble right now. Please try again.";

  if (
    ax.code === "ERR_NETWORK" ||
    ax.message === "Network Error" ||
    (!ax.response && ax.request)
  ) {
    return "Bilkeys couldn't connect. Check your connection and try again.";
  }

  return fallback;
}
