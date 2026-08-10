import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Monitor, Smartphone, Lightbulb } from "lucide-react";
import { RenderVisualDemo } from "./VisualRegistry";
import { Button } from "@/components/ui/button";

export function VisualWalkthrough({ article }) {
  const shouldReduceMotion = useReducedMotion();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [platform, setPlatform] = useState("web");

  const steps = article.steps || [];
  if (!steps.length) return null;

  const currentStep = steps[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleRestart = () => {
    setCurrentStepIndex(0);
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
      {/* Walkthrough Header & Platform Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Guided Walkthrough
          </span>
          <h2 className="font-heading text-2xl font-bold text-foreground mt-1">{article.title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{article.summary}</p>
        </div>

        {/* Web / Mobile Platform Toggle */}
        <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 self-start sm:self-center">
          <button
            onClick={() => setPlatform("web")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              platform === "web"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Web View</span>
          </button>
          <button
            onClick={() => setPlatform("mobile")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              platform === "mobile"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile View</span>
          </button>
        </div>
      </div>

      {/* Step Progress Line */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
          <span>
            STEP {currentStepIndex + 1} OF {steps.length}
          </span>
          <span>{currentStep.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {steps.map((st, idx) => {
            const isActive = idx === currentStepIndex;
            const isCompleted = idx < currentStepIndex;
            return (
              <React.Fragment key={st.id}>
                <button
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-2.5 rounded-full transition-all ${
                    isActive
                      ? "flex-1 bg-primary"
                      : isCompleted
                      ? "w-4 bg-primary/40"
                      : "w-4 bg-muted"
                  }`}
                  aria-label={`Go to step ${idx + 1}`}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Animated Step Visual & Description */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.id + platform}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Visual Demo */}
          {currentStep.visualType && (
            <div className="p-4 sm:p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
              <RenderVisualDemo visualType={currentStep.visualType} />
            </div>
          )}

          {/* Description & Platform-Specific Notes */}
          <div className="space-y-3">
            <h3 className="font-heading text-lg font-bold text-foreground">{currentStep.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{currentStep.description}</p>

            {currentStep.platformText && (
              <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground space-y-1">
                <span className="font-bold text-primary block uppercase text-[10px] tracking-wider">
                  {platform === "web" ? "Web Instructions" : "Mobile Instructions"}
                </span>
                <p className="leading-relaxed">
                  {platform === "web" ? currentStep.platformText.web : currentStep.platformText.mobile}
                </p>
              </div>
            )}

            {currentStep.tip && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> {currentStep.tip}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Walkthrough Controls */}
      <div className="flex items-center justify-between border-t border-border/60 pt-5">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrev}
          disabled={currentStepIndex === 0}
          className="gap-1 text-xs"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </Button>

        <Button variant="ghost" size="sm" onClick={handleRestart} className="gap-1 text-xs text-muted-foreground">
          <RotateCcw className="w-3.5 h-3.5" /> Restart
        </Button>

        {currentStepIndex < steps.length - 1 ? (
          <Button size="sm" onClick={handleNext} className="gap-1 text-xs">
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" variant="default" onClick={handleRestart} className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-500">
            Finished! Replay
          </Button>
        )}
      </div>
    </div>
  );
}
