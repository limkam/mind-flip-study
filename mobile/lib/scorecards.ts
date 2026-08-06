import { api } from "../api/client";
import type {
  ScorecardDataState,
  ScorecardMetrics,
  ScorecardOut,
  ScorecardPeriodType,
} from "../types/api";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PERIODS: Set<string> = new Set(["weekly", "monthly", "course"]);
const VALID_DATA_STATES: Set<string> = new Set([
  "empty",
  "partial",
  "complete",
]);

export type ParsedScorecardsResponse = {
  scorecards: ScorecardOut[];
  source_count: number;
  discarded_count: number;
  discarded_duplicates_count: number;
};

function isValidDateString(str: string): boolean {
  if (!DATE_REGEX.test(str)) return false;
  const [yearStr, monthStr, dayStr] = str.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseScorecardMetrics(raw: unknown): ScorecardMetrics | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const metrics: ScorecardMetrics = {};

  if (obj.data_state !== undefined) {
    if (
      typeof obj.data_state !== "string" ||
      !VALID_DATA_STATES.has(obj.data_state)
    ) {
      return null;
    }
    metrics.data_state = obj.data_state as ScorecardDataState;
  }

  if (obj.course_title !== undefined) {
    if (
      typeof obj.course_title !== "string" ||
      obj.course_title.trim().length === 0 ||
      obj.course_title.length > 200
    ) {
      return null;
    }
    metrics.course_title = obj.course_title.trim();
  }

  if (obj.assessments_completed !== undefined) {
    if (
      typeof obj.assessments_completed !== "number" ||
      !Number.isInteger(obj.assessments_completed) ||
      obj.assessments_completed < 0
    ) {
      return null;
    }
    metrics.assessments_completed = obj.assessments_completed;
  }

  if (obj.cards_reviewed !== undefined) {
    if (
      typeof obj.cards_reviewed !== "number" ||
      !Number.isInteger(obj.cards_reviewed) ||
      obj.cards_reviewed < 0
    ) {
      return null;
    }
    metrics.cards_reviewed = obj.cards_reviewed;
  }

  if (obj.current_streak !== undefined) {
    if (
      typeof obj.current_streak !== "number" ||
      !Number.isInteger(obj.current_streak) ||
      obj.current_streak < 0
    ) {
      return null;
    }
    metrics.current_streak = obj.current_streak;
  }

  if (obj.learning_minutes !== undefined) {
    if (
      typeof obj.learning_minutes !== "number" ||
      !Number.isFinite(obj.learning_minutes) ||
      obj.learning_minutes < 0
    ) {
      return null;
    }
    metrics.learning_minutes = obj.learning_minutes;
  }

  if (obj.average_assessment_score !== undefined) {
    if (obj.average_assessment_score !== null) {
      if (
        typeof obj.average_assessment_score !== "number" ||
        !Number.isFinite(obj.average_assessment_score) ||
        obj.average_assessment_score < 0 ||
        obj.average_assessment_score > 100
      ) {
        return null;
      }
    }
    metrics.average_assessment_score = obj.average_assessment_score;
  }

  if (obj.personal_best !== undefined) {
    if (typeof obj.personal_best !== "boolean") {
      return null;
    }
    metrics.personal_best = obj.personal_best;
  }

  return metrics;
}

function parseScorecardRow(raw: unknown): ScorecardOut | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !UUID_REGEX.test(obj.id)) {
    return null;
  }

  // entity_id can be empty string for weekly/monthly, or a string ID for course
  if (typeof obj.entity_id !== "string") {
    return null;
  }

  if (
    typeof obj.formula_version !== "string" ||
    obj.formula_version.trim().length === 0 ||
    obj.formula_version.length > 100
  ) {
    return null;
  }

  if (
    typeof obj.period_type !== "string" ||
    !VALID_PERIODS.has(obj.period_type)
  ) {
    return null;
  }

  if (
    typeof obj.period_start !== "string" ||
    !isValidDateString(obj.period_start) ||
    typeof obj.period_end !== "string" ||
    !isValidDateString(obj.period_end) ||
    obj.period_start > obj.period_end
  ) {
    return null;
  }

  if (
    typeof obj.score !== "number" ||
    !Number.isFinite(obj.score) ||
    obj.score < 0 ||
    obj.score > 100
  ) {
    return null;
  }

  const parsedMetrics = parseScorecardMetrics(obj.metrics);
  if (parsedMetrics === null) {
    return null;
  }

  return {
    id: obj.id,
    period_type: obj.period_type as ScorecardPeriodType,
    entity_id: obj.entity_id,
    period_start: obj.period_start,
    period_end: obj.period_end,
    score: obj.score,
    formula_version: obj.formula_version,
    metrics: parsedMetrics,
  };
}

export function parseScorecardsResponse(raw: unknown): ParsedScorecardsResponse {
  if (!Array.isArray(raw)) {
    throw new Error("Invalid scorecard response envelope: expected an array");
  }

  const sourceCount = raw.length;
  const scorecards: ScorecardOut[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  let discardedCount = 0;
  let discardedDuplicatesCount = 0;

  for (const item of raw) {
    const row = parseScorecardRow(item);
    if (!row) {
      discardedCount++;
      continue;
    }

    if (seenIds.has(row.id)) {
      discardedDuplicatesCount++;
      continue;
    }

    const logicalKey = `${row.period_type}:${row.entity_id}:${row.period_start}:${row.period_end}`;
    if (seenKeys.has(logicalKey)) {
      discardedDuplicatesCount++;
      continue;
    }

    seenIds.add(row.id);
    seenKeys.add(logicalKey);
    scorecards.push(row);
  }

  if (sourceCount > 0 && scorecards.length === 0) {
    throw new Error("All scorecard records in response were malformed");
  }

  return {
    scorecards,
    source_count: sourceCount,
    discarded_count: discardedCount,
    discarded_duplicates_count: discardedDuplicatesCount,
  };
}

export async function fetchScorecards(): Promise<ParsedScorecardsResponse> {
  const res = await api.get("/scorecards/");
  return parseScorecardsResponse(res.data);
}

export async function refreshScorecards(): Promise<ParsedScorecardsResponse> {
  const res = await api.post("/scorecards/refresh");
  return parseScorecardsResponse(res.data);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatPeriodDateRange(
  startStr: string,
  endStr: string,
): string {
  if (!DATE_REGEX.test(startStr) || !DATE_REGEX.test(endStr)) {
    return `${startStr} – ${endStr}`;
  }

  const [sY, sM, sD] = startStr.split("-").map((n) => parseInt(n, 10));
  const [eY, eM, eD] = endStr.split("-").map((n) => parseInt(n, 10));

  const startMonth = MONTH_NAMES[sM - 1] ?? "";
  const endMonth = MONTH_NAMES[eM - 1] ?? "";

  if (sY === eY) {
    if (sM === eM) {
      if (sD === eD) {
        return `${startMonth} ${sD}, ${sY}`;
      }
      return `${startMonth} ${sD} – ${eD}, ${sY}`;
    }
    return `${startMonth} ${sD} – ${endMonth} ${eD}, ${sY}`;
  }

  return `${startMonth} ${sD}, ${sY} – ${endMonth} ${eD}, ${eY}`;
}

export function validateScorecardShareUrl(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Invalid share URL: expected a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid share URL format");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Share URL must not contain credentials");
  }

  if (!parsed.hostname) {
    throw new Error("Share URL must contain a valid hostname");
  }

  const isLocalHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "10.0.2.2" ||
    parsed.hostname.endsWith(".local");

  if (parsed.protocol === "http:") {
    if (!isLocalHost) {
      throw new Error("HTTP share URLs are only permitted for local development");
    }
  } else if (parsed.protocol !== "https:") {
    throw new Error("Share URL must use the HTTPS protocol");
  }

  return parsed.toString();
}

export function parseShareOutResponse(raw: unknown): import("../types/api").ShareOut {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid share creation response: expected a plain object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !UUID_REGEX.test(obj.id)) {
    throw new Error("Invalid share creation response: malformed share ID");
  }

  if (typeof obj.share_url !== "string") {
    throw new Error("Invalid share creation response: missing share_url");
  }

  const validUrl = validateScorecardShareUrl(obj.share_url);

  if (typeof obj.expires_at !== "string" || Number.isNaN(Date.parse(obj.expires_at))) {
    throw new Error("Invalid share creation response: malformed expires_at timestamp");
  }

  const expiresTime = Date.parse(obj.expires_at);
  if (expiresTime <= Date.now()) {
    throw new Error("Invalid share creation response: expires_at must be in the future");
  }

  if (typeof obj.show_display_name !== "boolean") {
    throw new Error("Invalid share creation response: missing show_display_name");
  }

  return {
    id: obj.id,
    share_url: validUrl,
    expires_at: obj.expires_at,
    show_display_name: obj.show_display_name,
  };
}

export function validatePublicDisplayName(
  raw: string,
  required: boolean,
): { valid: true; value: string | null } | { valid: false; message: string } {
  if (!required) {
    return { valid: true, value: null };
  }

  const trimmed = raw.trim();

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) < 32) {
      return { valid: false, message: "Control characters are not allowed." };
    }
  }

  if (trimmed.length > 80) {
    return { valid: false, message: "Public display name cannot exceed 80 characters." };
  }

  if (!trimmed) {
    return {
      valid: false,
      message: "A public display name is required when name sharing is enabled.",
    };
  }

  return { valid: true, value: trimmed };
}

export async function createScorecardShare(
  scorecardId: string,
  input: import("../types/api").ShareCreateIn,
): Promise<import("../types/api").ShareOut> {
  if (!UUID_REGEX.test(scorecardId)) {
    throw new Error("Invalid scorecard ID");
  }

  const payload: import("../types/api").ShareCreateIn = {
    expires_in_days: input.expires_in_days,
    show_display_name: input.show_display_name,
    public_display_name: input.show_display_name ? input.public_display_name : null,
  };

  const res = await api.post(`/scorecards/${scorecardId}/share`, payload);
  return parseShareOutResponse(res.data);
}

export function parseShareRevokeResponse(
  raw: unknown,
): import("../types/api").ShareRevokeOut {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid share revocation response: expected object");
  }

  const obj = raw as Record<string, unknown>;

  if (obj.revoked !== true) {
    throw new Error("Invalid share revocation response: expected revoked=true");
  }

  return { revoked: true };
}

export async function revokeScorecardShare(
  scorecardId: string,
  shareId: string,
): Promise<import("../types/api").ShareRevokeOut> {
  if (!UUID_REGEX.test(scorecardId)) {
    throw new Error("Invalid scorecard ID");
  }
  if (!UUID_REGEX.test(shareId)) {
    throw new Error("Invalid share ID");
  }

  const res = await api.delete(`/scorecards/${scorecardId}/share/${shareId}`);
  return parseShareRevokeResponse(res.data);
}
