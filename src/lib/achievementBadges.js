/** Map API achievement rows to badge card display (Challenge Board / profile). */

import { ALL_ACHIEVEMENTS } from "@/lib/achievements";

export function badgeCategory(achievementType) {
  if (achievementType.startsWith("streak")) return "streak";
  if (achievementType.includes("challenge") || achievementType === "first_challenge") return "completion";
  if (achievementType === "perfect_score") return "accuracy";
  if (achievementType.startsWith("cards") || achievementType.startsWith("quiz")) return "mastery";
  return "completion";
}

export function achievementToBadge(row) {
  const meta = row.metadata || {};
  const type = row.achievement_type || "";
  return {
    id: row.id,
    achievement_type: type,
    title: meta.title || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: meta.description || "",
    icon: meta.icon || "🏅",
    category: badgeCategory(type),
    earned_at: row.earned_at,
  };
}

/** Same unlock rules as Achievements page — earned in DB or criteria met from stats. */
export function unlockedBadgeList(earnedRows = [], stats) {
  const earnedByType = Object.fromEntries(
    (earnedRows || []).map((row) => [row.achievement_type, row]),
  );
  return ALL_ACHIEVEMENTS.filter((def) => earnedByType[def.id] || def.check(stats)).map((def) => {
    const row = earnedByType[def.id];
    const meta = row?.metadata || {};
    return {
      id: row?.id ?? def.id,
      achievement_type: def.id,
      title: meta.title || def.title,
      description: meta.description || def.description,
      icon: meta.icon || def.icon,
      category: badgeCategory(def.id),
      earned_at: row?.earned_at,
    };
  });
}
