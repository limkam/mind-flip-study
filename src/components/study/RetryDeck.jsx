import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, CheckCircle2, ChevronLeft, ChevronRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import FlashCard from "./FlashCard";

export default function RetryDeck({ wrongCards, onDone }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);

  if (!wrongCards || wrongCards.length === 0) return null;

  const card = wrongCards[index];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-rose-300 dark:border-rose-800 p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Brain className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h3 className="font-heading font-semibold">Smart Retry Deck</h3>
          <p className="text-xs text-muted-foreground">{wrongCards.length} cards you got wrong — review them now</p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={onDone}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Done
        </Button>
      </div>

      <div className="max-w-md mx-auto mb-4">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            variants={{
              enter: (d) => ({ x: d * 200, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d) => ({ x: d * -200, opacity: 0 }),
            }}
            initial="enter" animate="center" exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <FlashCard front={card.front} back={card.back} difficulty={card.difficulty} chapter={card.chapter} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon"
          disabled={index === 0}
          onClick={() => { setDir(-1); setIndex(i => i - 1); }}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground font-medium">{index + 1} / {wrongCards.length}</span>
        <Button variant="outline" size="icon"
          disabled={index === wrongCards.length - 1}
          onClick={() => { setDir(1); setIndex(i => i + 1); }}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}