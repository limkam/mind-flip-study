/** Map API achievement rows to badge card display (Challenge Board). */

import { ALL_ACHIEVEMENTS, type AchievementStats } from "./achievements";

export function badgeCategory(achievementType: string) {
  if (achievementType.startsWith("streak")) return "streak";
  if (achievementType.includes("challenge") || achievementType === "first_challenge") return "completion";
  if (achievementType === "perfect_score") return "accuracy";
  if (achievementType.startsWith("cards") || achievementType.startsWith("quiz")) return "mastery";
  return "completion";
}

export type AchievementRow = {
  id: string;
  achievement_type: string;
  earned_at?: string;
  metadata?: { title?: string; description?: string; icon?: string };
};

export function achievementToBadge(row: AchievementRow) {
  const meta = row.metadata || {};
  const type = row.achievement_type || "";
  return {
    id: row.id,
    title: meta.title || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: meta.description || "",
    icon: meta.icon || "🏅",
    category: badgeCategory(type),
  };
}

/** Same unlock rules as Achievements screen — earned in DB or criteria met from stats. */
export function unlockedBadgeList(earnedRows: AchievementRow[] = [], stats: AchievementStats) {
  const earnedByType = Object.fromEntries(earnedRows.map((row) => [row.achievement_type, row]));
  return ALL_ACHIEVEMENTS.filter((def) => earnedByType[def.id] || def.check(stats)).map((def) => {
    const row = earnedByType[def.id];
    const meta = row?.metadata || {};
    return {
      id: row?.id ?? def.id,
      title: meta.title || def.title,
      description: meta.description || def.description,
      icon: meta.icon || def.icon,
      category: badgeCategory(def.id),
    };
  });
}
