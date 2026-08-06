function parseBoolFlag(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === null || val.trim() === "") return defaultVal;
  const normalized = val.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return defaultVal;
}

export const mobileFeatures = {
  notifications: parseBoolFlag(
    process.env.EXPO_PUBLIC_ENGAGEMENT_NOTIFICATIONS_ENABLED,
    true,
  ),
  nudges: parseBoolFlag(
    process.env.EXPO_PUBLIC_ENGAGEMENT_NUDGES_ENABLED,
    true,
  ),
  scorecards: parseBoolFlag(
    process.env.EXPO_PUBLIC_ENGAGEMENT_SCORECARDS_ENABLED,
    true,
  ),
} as const;
