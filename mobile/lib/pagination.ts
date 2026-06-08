import type { Paginated } from "../types/api";

/** Flatten react-query infinite pages and drop null/undefined rows (bad API rows or stale cache). */
export function flattenPages<T>(
  pages: Array<Paginated<T> | undefined> | undefined,
  isValid: (row: T) => boolean = (row) => Boolean((row as { id?: string }).id),
): T[] {
  if (!pages?.length) return [];
  return pages.flatMap((page) => page?.items ?? []).filter(isValid);
}

/** Extract rows from a list endpoint that returns either an array or a paginated envelope. */
export function normalizeList<T>(
  data: Paginated<T> | T[] | null | undefined,
  isValid: (row: T) => boolean = (row) => Boolean((row as { id?: string }).id),
): T[] {
  if (Array.isArray(data)) return data.filter(isValid);
  return (data?.items ?? []).filter(isValid);
}

/** Normalize list API responses that may be paginated or a plain array. */
export function normalizePage<T>(
  data: Paginated<T> | T[] | null | undefined,
  page: number,
  size: number,
  isValid: (row: T) => boolean = (row) => Boolean((row as { id?: string }).id),
): Paginated<T> {
  if (Array.isArray(data)) {
    const items = data.filter(isValid);
    const total = items.length;
    return {
      items,
      page: 1,
      size: total,
      total,
      has_more: false,
      total_pages: total > 0 ? 1 : 0,
    };
  }
  const items = (data?.items ?? []).filter(isValid);
  const total = data?.total ?? items.length;
  const hasMore = data?.has_more ?? page * size < total;
  return {
    items,
    page: data?.page ?? page,
    size: data?.size ?? size,
    total,
    has_more: hasMore,
    total_pages: data?.total_pages ?? (size > 0 ? Math.ceil(total / size) : 0),
  };
}
