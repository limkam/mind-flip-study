import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_DOTS = 15;

export default function FlashcardNavigation({
  currentIndex,
  total,
  cardProgressMap = {},
  onPrev,
  onNext,
  onSelect,
}) {
  const dotsRef = useRef(null);

  useEffect(() => {
    const el = dotsRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentIndex]);

  const useCompact = total > MAX_DOTS;

  return (
    <div className="flex items-center gap-3 sm:gap-5 w-full max-w-xl mx-auto">
      <motion.div whileTap={{ scale: 0.92 }} className="flex-shrink-0">
        <Button
          variant="outline"
          size="icon"
          className="w-11 h-11 rounded-full shadow-sm"
          onClick={onPrev}
          disabled={currentIndex === 0}
          aria-label="Previous card"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      </motion.div>

      <div
        ref={dotsRef}
        className="flex-1 min-w-0 flex items-center justify-center overflow-x-auto scrollbar-hide px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {useCompact ? (
          <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap px-2">
            Card {currentIndex + 1} of {total}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            {Array.from({ length: total }, (_, i) => {
              const progress = cardProgressMap[i];
              const dotColor = progress?.rating === 'easy'
                ? 'bg-emerald-400'
                : progress?.rating === 'hard'
                  ? 'bg-rose-400'
                  : progress?.rating === 'medium'
                    ? 'bg-amber-400'
                    : 'bg-muted-foreground/25';
              return (
                <button
                  key={i}
                  type="button"
                  data-active={i === currentIndex ? 'true' : 'false'}
                  aria-label={`Go to card ${i + 1}`}
                  aria-current={i === currentIndex ? 'true' : undefined}
                  onClick={() => onSelect(i)}
                  className={`rounded-full transition-all duration-300 hover:scale-125 flex-shrink-0
                    ${i === currentIndex
                      ? 'w-5 h-2.5 bg-primary'
                      : `w-2 h-2 ${dotColor}`}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <motion.div whileTap={{ scale: 0.92 }} className="flex-shrink-0">
        <Button
          variant="outline"
          size="icon"
          className="w-11 h-11 rounded-full shadow-sm"
          onClick={onNext}
          disabled={currentIndex >= total - 1}
          aria-label="Next card"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </motion.div>
    </div>
  );
}
