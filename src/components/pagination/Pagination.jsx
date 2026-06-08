import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Previous / next pager for 1-based `page` and fixed `pageSize`.
 * Hides when `hideWhenSinglePage` and all items fit on one page.
 */
export default function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  className,
  hideWhenSinglePage = true,
  previousLabel = 'Previous',
  nextLabel = 'Next',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  if (hideWhenSinglePage && total <= pageSize) {
    return null;
  }

  const btnClass =
    'px-4 py-2 rounded-lg border bg-background text-sm font-medium disabled:opacity-40';

  return (
    <div className={cn('flex items-center justify-center gap-4', className)}>
      <button
        type="button"
        className={btnClass}
        disabled={page <= 1}
        onClick={() => onPageChange((p) => Math.max(1, p - 1))}
      >
        {previousLabel}
      </button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className={btnClass}
        disabled={page >= totalPages}
        onClick={() => onPageChange((p) => p + 1)}
      >
        {nextLabel}
      </button>
    </div>
  );
}
