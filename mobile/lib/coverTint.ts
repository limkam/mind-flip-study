import type { ThemeColors } from "../hooks/useTheme";

export type CoverTint = { bg: string; fg: string };

/** Deterministic index from an id — never random, so an item's tint never flickers between renders. */
export function hashIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/** Brand-family tint pairs for generated covers — token-backed, no hardcoded hex. */
export function coverTints(colors: ThemeColors): CoverTint[] {
  return [
    { bg: colors.surfaceBrand, fg: colors.primary },
    { bg: colors.streakSurface, fg: colors.streak },
    { bg: colors.infoSurface, fg: colors.info },
    { bg: colors.xpSurface, fg: colors.xp },
    { bg: colors.successSurface, fg: colors.success },
  ];
}

export function coverTintFor(id: string, colors: ThemeColors): CoverTint {
  const tints = coverTints(colors);
  return tints[hashIndex(id, tints.length)];
}
