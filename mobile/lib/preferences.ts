/**
 * Preferences and study theme helpers for mobile (PAR-017 & PAR-018).
 */

export type StudyThemeId = "indigo" | "ocean" | "sunset" | "forest" | "midnight" | "rose";

export type StudyThemeDefinition = {
  id: StudyThemeId;
  label: string;
  description: string;
  cardFrontBackground: string;
  cardBackBackground: string;
  accentBorder: string;
  tagColor: string;
};

export const STUDY_THEMES: StudyThemeDefinition[] = [
  {
    id: "indigo",
    label: "Indigo Classic",
    description: "The default rich indigo & violet palette",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#f0f4ff",
    accentBorder: "#6366f1",
    tagColor: "#4f46e5",
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    description: "Cool blues and cyans for calm focus",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#ecfeff",
    accentBorder: "#0284c7",
    tagColor: "#0891b2",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm oranges and pinks for energy",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#fff7ed",
    accentBorder: "#f97316",
    tagColor: "#e11d48",
  },
  {
    id: "forest",
    label: "Forest",
    description: "Earthy greens and browns for grounding",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#f0fdf4",
    accentBorder: "#16a34a",
    tagColor: "#15803d",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep purples and blues for night study",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#faf5ff",
    accentBorder: "#9333ea",
    tagColor: "#7e22ce",
  },
  {
    id: "rose",
    label: "Rose",
    description: "Soft pinks for a gentle learning mood",
    cardFrontBackground: "#ffffff",
    cardBackBackground: "#fff1f2",
    accentBorder: "#f43f5e",
    tagColor: "#be185d",
  },
];

export function getStudyTheme(themeId?: string): StudyThemeDefinition {
  return STUDY_THEMES.find((t) => t.id === themeId) ?? STUDY_THEMES[0];
}

/**
 * Validates display name input.
 * Rejects empty or whitespace-only strings, or strings over 255 chars.
 */
export function validateDisplayName(name: string): { valid: true; name: string } | { valid: false; reason: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, reason: "Display name cannot be empty." };
  }
  if (trimmed.length > 255) {
    return { valid: false, reason: "Display name cannot exceed 255 characters." };
  }
  return { valid: true, name: trimmed };
}

/**
 * Validates avatar URL input.
 * Optional; if provided, must be a valid HTTP/HTTPS URL.
 */
export function validateAvatarUrl(url: string): { valid: true; url: string | null } | { valid: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: true, url: null };
  }
  if (!trimmed.toLowerCase().startsWith("http://") && !trimmed.toLowerCase().startsWith("https://")) {
    return { valid: false, reason: "Profile picture must be a valid http:// or https:// URL." };
  }
  if (trimmed.length > 1024) {
    return { valid: false, reason: "Profile picture URL cannot exceed 1024 characters." };
  }
  return { valid: true, url: trimmed };
}
export function isValidStudyTheme(themeId: unknown): themeId is StudyThemeId {
  return typeof themeId === "string" && STUDY_THEMES.some((t) => t.id === themeId);
}

export function parseUserResponse(data: unknown, requestingUserId: string): { valid: true; user: any } | { valid: false; reason: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "Response body is not an object." };
  }
  const u = data as Record<string, unknown>;
  if (typeof u.id !== "string" || !u.id) {
    return { valid: false, reason: "Response missing canonical user ID." };
  }
  if (u.id !== requestingUserId) {
    return { valid: false, reason: `User ID mismatch: expected ${requestingUserId}, got ${u.id}` };
  }
  if (typeof u.email !== "string" || !u.email) {
    return { valid: false, reason: "Response missing required email field." };
  }
  if (typeof u.full_name !== "string" || !u.full_name.trim()) {
    return { valid: false, reason: "Response missing required full_name field." };
  }
  if (u.preferences !== undefined && u.preferences !== null && typeof u.preferences !== "object") {
    return { valid: false, reason: "Response preferences field is not an object." };
  }
  return { valid: true, user: u };
}

export function parseEngagementPreferencesResponse(data: unknown): { valid: true; preferences: any } | { valid: false; reason: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "Response body is not an object." };
  }
  const p = data as Record<string, unknown>;
  const boolKeys = [
    "in_app_enabled",
    "learning_reminders",
    "streak_reminders",
    "weekly_summaries",
    "achievement_announcements",
    "marketing_emails",
    "celebration_animations",
    "achievement_sounds",
    "streak_sounds",
  ];
  for (const k of boolKeys) {
    if (typeof p[k] !== "boolean") {
      return { valid: false, reason: `Field ${k} must be boolean.` };
    }
  }
  if (typeof p.timezone !== "string" || !p.timezone) {
    return { valid: false, reason: "Field timezone must be a non-empty string." };
  }
  return { valid: true, preferences: p };
}
