export type TagValidationResult =
  | { valid: true; tag: string }
  | { valid: false; reason: string };

/**
 * Normalizes a tag string by trimming leading/trailing whitespace and converting to lowercase.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validates a candidate tag against existing normalized tags.
 * Neither Web nor Backend enforces artificial length or count limits.
 */
export function validateTagInput(
  raw: string,
  existingTags: string[],
): TagValidationResult {
  const normalized = normalizeTag(raw);
  if (!normalized) {
    return { valid: false, reason: "Tag cannot be empty." };
  }
  if (existingTags.map((t) => normalizeTag(t)).includes(normalized)) {
    return { valid: false, reason: "Tag already exists in set." };
  }
  return { valid: true, tag: normalized };
}

/**
 * Normalizes an array of tags, trimming whitespace and deduplicating while preserving order.
 */
export function normalizeTagsList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const norm = normalizeTag(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}
