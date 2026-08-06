export const EVENT_TYPES = Object.freeze([
  "lesson_complete",
  "achievement_unlock",
  "streak_extended",
  "streak_milestone",
  "course_complete",
] as const);

export type SupportedCelebrationType = typeof EVENT_TYPES[number];

export type CelebrationLevel = "subtle" | "medium" | "major";

export interface NormalizedCelebration {
  eventId: string;
  type: SupportedCelebrationType;
  level: CelebrationLevel;
  occurredAt: string;
  entityId?: string;
  title?: string;
  message?: string;
  metadata: Record<string, unknown>;
  relatedEventIds?: string[];
}

const LEVEL_RANK: Record<CelebrationLevel, number> = {
  subtle: 1,
  medium: 2,
  major: 3,
};

export const MOBILE_PRESENTATION_AUTO_DISMISS_MS: Record<CelebrationLevel, number> = {
  subtle: 3500,
  medium: 5000,
  major: 7000,
};

export function isSupportedCelebrationType(type: unknown): type is SupportedCelebrationType {
  return typeof type === "string" && (EVENT_TYPES as readonly string[]).includes(type);
}

export function celebrationLevel(
  type: SupportedCelebrationType,
  metadata: Record<string, unknown> = {},
): CelebrationLevel {
  if (type === "course_complete") return "major";
  if (type === "achievement_unlock") return metadata.major === true ? "major" : "medium";
  if (type === "streak_milestone") {
    const days = Number(metadata.streakDays ?? metadata.streak_days ?? 0);
    return days >= 30 ? "major" : days >= 7 ? "medium" : "subtle";
  }
  return "subtle";
}

export function normalizeCelebration(input: unknown): NormalizedCelebration | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const eventId = typeof raw.eventId === "string" ? raw.eventId.trim() : "";
  if (!eventId) return null;

  const type = raw.type;
  if (!isSupportedCelebrationType(type)) return null;

  const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
    ? (raw.metadata as Record<string, unknown>)
    : {};

  const levelInput = raw.level;
  const level: CelebrationLevel = (levelInput === "subtle" || levelInput === "medium" || levelInput === "major")
    ? levelInput
    : celebrationLevel(type, metadata);

  const occurredAt = typeof raw.occurredAt === "string" && !Number.isNaN(Date.parse(raw.occurredAt))
    ? raw.occurredAt
    : new Date().toISOString();

  const entityId = typeof raw.entityId === "string" && raw.entityId.trim() ? raw.entityId.trim() : undefined;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined;
  const message = typeof raw.message === "string" && raw.message.trim() ? raw.message.trim() : undefined;

  const relatedEventIds = Array.isArray(raw.relatedEventIds)
    ? raw.relatedEventIds.filter((id): id is string => typeof id === "string" && !!id.trim())
    : undefined;

  return {
    eventId,
    type,
    level,
    occurredAt,
    entityId,
    title,
    message,
    metadata,
    relatedEventIds,
  };
}

export function aggregateCelebrations(events: unknown[]): NormalizedCelebration | null {
  const valid = events.map(normalizeCelebration).filter((e): e is NormalizedCelebration => e !== null);
  if (valid.length === 0) return null;

  // Deduplicate by eventId preserving first occurrence order
  const uniqueMap = new Map<string, NormalizedCelebration>();
  for (const item of valid) {
    if (!uniqueMap.has(item.eventId)) {
      uniqueMap.set(item.eventId, item);
    }
  }
  const uniqueItems = Array.from(uniqueMap.values());
  if (uniqueItems.length === 0) return null;

  // Select primary winner based on level rank, then type index matching web policy.js line 20
  const winner = [...uniqueItems].sort((a, b) => {
    const rankDiff = LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
    if (rankDiff !== 0) return rankDiff;
    return (EVENT_TYPES as readonly string[]).indexOf(b.type) - (EVENT_TYPES as readonly string[]).indexOf(a.type);
  })[0];

  const relatedEventIds = Array.from(new Set(uniqueItems.map((item) => item.eventId)));

  return {
    ...winner,
    relatedEventIds,
    metadata: {
      ...winner.metadata,
      collapsedCount: uniqueItems.length - 1,
    },
  };
}

export function mayUseMajorAnimation(event: NormalizedCelebration | null): boolean {
  if (!event) return false;
  return (
    event.level === "major"
    && (event.type === "course_complete" || event.type === "streak_milestone" || event.metadata?.major === true)
  );
}

export function getLevelRank(level: CelebrationLevel): number {
  return LEVEL_RANK[level];
}
