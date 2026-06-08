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
  if (typeof detail === "object" && detail !== null && "msg" in detail) {
    return String((detail as { msg: string }).msg);
  }
  return JSON.stringify(detail);
}

/** Human-readable message from axios/FastAPI responses (handles validation arrays). */
export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  const ax = error as AxiosError<{ detail?: unknown }>;
  const fromBody = formatDetail(ax.response?.data?.detail);
  if (fromBody) return fromBody;

  const status = ax.response?.status;
  if (status === 429) return "Too many attempts. Try again in a minute.";

  if (
    ax.code === "ERR_NETWORK" ||
    ax.message === "Network Error" ||
    (!ax.response && ax.request)
  ) {
    const base = process.env.EXPO_PUBLIC_API_URL ?? "";
    const hint =
      base.includes("localhost") || base.includes("127.0.0.1")
        ? " On a physical phone, localhost points at the phone itself — set EXPO_PUBLIC_API_URL to your computer's LAN IP and ensure the API listens on 0.0.0.0."
        : "";
    return `Cannot reach the API at ${base || "(unset)"}.${hint}`;
  }

  return ax.message || fallback;
}
