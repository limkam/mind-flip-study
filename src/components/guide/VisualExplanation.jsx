import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RenderVisualDemo } from "./VisualRegistry";
import { CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VisualExplanation({ article, onSelectArticle }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-card border border-border/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
        {/* Header */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            Visual Explanation
          </span>
          <h2 className="font-heading text-2xl font-bold text-foreground">{article.title}</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{article.summary}</p>
        </div>

        {/* Visual Interactive Diagram / Demo */}
        {article.visualType && (
          <div className="p-4 sm:p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
            <RenderVisualDemo visualType={article.visualType} />
          </div>
        )}

        {/* Reference Sections */}
        {article.sections && article.sections.length > 0 && (
          <div className="space-y-6 pt-4 border-t border-border/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detailed Explanation</h3>
            {article.sections.map((sec, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  {sec.heading}
                </h4>
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line pl-6">
                  {sec.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
