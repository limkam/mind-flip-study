import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Lightbulb } from "lucide-react";

export default function ScenarioView({ scenarios = [] }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!scenarios.length) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-border">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Lightbulb className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading text-xl font-semibold mb-2">Application Scenarios</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          No scenarios were generated for this set. Generate a new study set to include realistic application scenarios.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {scenarios.length} scenario{scenarios.length !== 1 ? "s" : ""} — apply what you learned to realistic situations.
      </p>
      {scenarios.map((scenario, i) => {
        const open = openIndex === i;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            <button
              type="button"
              className="w-full flex items-start gap-3 p-5 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setOpenIndex(open ? -1 : i)}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-semibold text-base">{scenario.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{scenario.prompt}</p>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {open && scenario.guidance ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 pl-16">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                      Strong answer should cover
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{scenario.guidance}</p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
