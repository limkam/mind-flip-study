import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const TYPE_LABELS = {
  real_life: "Real-Life Application",
  decision: "Decision-Making",
  professional: "Professional Case Study",
};

const SECTION_STYLES = {
  challenge: "bg-amber-500/10 border-amber-500/25 dark:bg-amber-500/15 dark:border-amber-500/30",
  question: "bg-sky-500/10 border-sky-500/25 dark:bg-sky-500/15 dark:border-sky-500/30",
  answer: "bg-emerald-500/10 border-emerald-500/25 dark:bg-emerald-500/15 dark:border-emerald-500/30",
};

function ScenarioSection({ label, children, tone }) {
  return (
    <div className={`rounded-xl border p-4 ${SECTION_STYLES[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-2">{label}</p>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

function groupScenariosByChapter(scenarios) {
  const groups = [];
  const map = new Map();
  for (const scenario of scenarios) {
    const chapter = scenario.chapter?.trim() || "Scenarios";
    if (!map.has(chapter)) {
      const group = { chapter, items: [] };
      map.set(chapter, group);
      groups.push(group);
    }
    map.get(chapter).items.push(scenario);
  }
  return groups;
}

function ScenarioCard({ scenario, index, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const typeLabel = TYPE_LABELS[scenario.type] || "Scenario";
  const question = scenario.question || scenario.prompt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <button
        type="button"
        className="w-full flex items-start gap-3 p-5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{typeLabel}</span>
          <h3 className="font-heading font-semibold text-base mt-1">{scenario.title}</h3>
          {scenario.context ? (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{scenario.context}</p>
          ) : null}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pl-16 space-y-3">
              {scenario.challenge ? (
                <ScenarioSection label="Challenge" tone="challenge">
                  {scenario.challenge}
                </ScenarioSection>
              ) : null}
              {question ? (
                <ScenarioSection label="Questions" tone="question">
                  {question}
                </ScenarioSection>
              ) : null}
              {(scenario.model_answer || scenario.explanation || scenario.guidance) ? (
                <ScenarioSection label="Model Answers" tone="answer">
                  {scenario.model_answer ? <p className="mb-2">{scenario.model_answer}</p> : null}
                  {(scenario.explanation || scenario.guidance) ? (
                    <p className="whitespace-pre-wrap text-foreground/90">
                      {scenario.explanation || scenario.guidance}
                    </p>
                  ) : null}
                </ScenarioSection>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ScenarioView({
  scenarios = [],
  setId,
  onScenariosChange,
}) {
  const [loading, setLoading] = useState(false);
  const [displayScenarios, setDisplayScenarios] = useState(scenarios);
  const { toast } = useToast();

  React.useEffect(() => {
    setDisplayScenarios(scenarios);
  }, [scenarios]);

  const chapterGroups = useMemo(
    () => groupScenariosByChapter(displayScenarios),
    [displayScenarios],
  );

  const regenerateScenarios = async () => {
    if (!setId) return;
    setLoading(true);
    try {
      const { data } = await client.post(`/flashcard-sets/${setId}/scenarios/regenerate`);
      const next = data.scenarios || [];
      setDisplayScenarios(next);
      onScenariosChange?.(next);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === "object" ? detail.message : detail || err.message || "Regeneration failed";
      toast({ title: "Regeneration failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!displayScenarios.length && !loading) {
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

  if (loading) {
    return (
      <div className="text-center py-16 bg-card rounded-2xl border border-border">
        <div className="relative w-14 h-14 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
          <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-primary" />
        </div>
        <p className="font-medium text-foreground">Regenerating scenarios...</p>
        <p className="text-sm text-muted-foreground mt-1">
          Please wait while we create a new set of scenarios.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {displayScenarios.length} scenarios across {chapterGroups.length} chapter
          {chapterGroups.length !== 1 ? "s" : ""} — apply, decide, and analyze concepts from the document.
        </p>
        {setId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={regenerateScenarios}
            className="gap-1.5 text-muted-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate Scenarios
          </Button>
        ) : null}
      </div>

      {chapterGroups.map((group) => (
        <section key={group.chapter} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-semibold">{group.chapter}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {group.items.length} scenario{group.items.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {group.items.map((scenario, i) => (
              <ScenarioCard key={`${group.chapter}-${i}-${scenario.title}`} scenario={scenario} index={i} defaultOpen={i === 0} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
