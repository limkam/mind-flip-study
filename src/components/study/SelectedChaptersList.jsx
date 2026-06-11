import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEFAULT_VISIBLE = 5;

export default function SelectedChaptersList({
  chapters = [],
  title = 'Selected Chapters',
  initialVisible = DEFAULT_VISIBLE,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);

  if (!chapters.length) return null;

  const count = chapters.length;
  const heading = `${title}${count ? ` (${count})` : ''}`;
  const hasMore = count > initialVisible;
  const visible = expanded || !hasMore ? chapters : chapters.slice(0, initialVisible);
  const hiddenCount = Math.max(0, count - initialVisible);

  return (
    <div className={`rounded-xl border border-border bg-muted/30 p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-foreground mb-3">{heading}</h3>
      <ul className="space-y-2">
        {visible.map((chapter) => (
          <li key={chapter} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true">•</span>
            <span className="leading-snug">{chapter}</span>
          </li>
        ))}
      </ul>
      {hasMore && !expanded ? (
        <p className="text-sm font-medium text-muted-foreground mt-3">
          +{hiddenCount} more chapter{hiddenCount !== 1 ? 's' : ''}
        </p>
      ) : null}
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2 text-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-1" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-1" /> Show all
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
