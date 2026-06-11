import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import type { ScenarioOut } from "../../types/api";

const TYPE_LABELS: Record<string, string> = {
  real_life: "Real-Life Application",
  decision: "Decision-Making",
  professional: "Professional Case Study",
};

const SECTIONS = {
  challenge: { label: "Challenge", bg: "#fef3c7", border: "#fcd34d", darkBg: "#42200633", darkBorder: "#f59e0b55" },
  question: { label: "Questions", bg: "#e0f2fe", border: "#7dd3fc", darkBg: "#0c4a6e33", darkBorder: "#38bdf855" },
  answer: { label: "Model Answers", bg: "#d1fae5", border: "#6ee7b7", darkBg: "#064e3b33", darkBorder: "#34d39955" },
};

function groupScenariosByChapter(scenarios: ScenarioOut[]) {
  const groups: { chapter: string; items: ScenarioOut[] }[] = [];
  const map = new Map<string, { chapter: string; items: ScenarioOut[] }>();
  for (const scenario of scenarios) {
    const chapter = scenario.chapter?.trim() || "Scenarios";
    if (!map.has(chapter)) {
      const group = { chapter, items: [] };
      map.set(chapter, group);
      groups.push(group);
    }
    map.get(chapter)!.items.push(scenario);
  }
  return groups;
}

function Section({
  tone,
  children,
  colors,
  isDark,
}: {
  tone: keyof typeof SECTIONS;
  children: ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark?: boolean;
}) {
  const spec = SECTIONS[tone];
  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: isDark ? spec.darkBg : spec.bg,
          borderColor: isDark ? spec.darkBorder : spec.border,
        },
      ]}
    >
      <Text style={[styles.sectionLabel, { color: colors.text }]}>{spec.label}</Text>
      <Text style={[styles.body, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

function ScenarioCard({
  scenario,
  index,
  open,
  onToggle,
  colors,
  isDark,
}: {
  scenario: ScenarioOut;
  index: number;
  open: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark?: boolean;
}) {
  const typeLabel = TYPE_LABELS[scenario.type || ""] || "Scenario";
  const question = scenario.question || scenario.prompt || "";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable style={styles.cardHead} onPress={onToggle}>
        <View style={[styles.num, { backgroundColor: `${colors.primary}18` }]}>
          <Text style={[styles.numText, { color: colors.primary }]}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.typeLabel, { color: colors.primary }]}>{typeLabel}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{scenario.title}</Text>
          {scenario.context ? <Text style={[styles.body, { color: colors.muted }]}>{scenario.context}</Text> : null}
        </View>
        <Text style={{ color: colors.muted }}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.answerWrap}>
          {scenario.challenge ? (
            <Section tone="challenge" colors={colors} isDark={isDark}>
              {scenario.challenge}
            </Section>
          ) : null}
          {question ? (
            <Section tone="question" colors={colors} isDark={isDark}>
              {question}
            </Section>
          ) : null}
          {scenario.model_answer || scenario.explanation || scenario.guidance ? (
            <Section tone="answer" colors={colors} isDark={isDark}>
              {scenario.model_answer}
              {scenario.explanation || scenario.guidance
                ? `\n\n${scenario.explanation || scenario.guidance}`
                : ""}
            </Section>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  scenarios?: ScenarioOut[];
  setId?: string;
  onScenariosChange?: (scenarios: ScenarioOut[]) => void;
};

export function ScenarioView({ scenarios = [], setId, onScenariosChange }: Props) {
  const { colors, isDark } = useTheme();
  const [openIndex, setOpenIndex] = useState("0-0");
  const [loading, setLoading] = useState(false);
  const [displayScenarios, setDisplayScenarios] = useState(scenarios);

  useEffect(() => {
    setDisplayScenarios(scenarios);
  }, [scenarios]);

  const chapterGroups = useMemo(() => groupScenariosByChapter(displayScenarios), [displayScenarios]);

  const regenerateScenarios = async () => {
    if (!setId) return;
    setLoading(true);
    try {
      const { data } = await api.post<{ scenarios: ScenarioOut[] }>(
        `/flashcard-sets/${setId}/scenarios/regenerate`,
      );
      const next = data.scenarios || [];
      setDisplayScenarios(next);
      onScenariosChange?.(next);
      setOpenIndex("0-0");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Regeneration failed")
          : "Regeneration failed";
      Alert.alert("Regeneration failed", msg);
    } finally {
      setLoading(false);
    }
  };

  if (!displayScenarios.length && !loading) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={styles.emptyIcon}>💡</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Application Scenarios</Text>
        <Text style={[styles.emptyBody, { color: colors.muted }]}>
          No scenarios were generated for this set. Generate a new study set to include realistic application scenarios.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingTitle, { color: colors.text }]}>Regenerating scenarios...</Text>
        <Text style={[styles.loadingBody, { color: colors.muted }]}>
          Please wait while we create a new set of scenarios.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={[styles.lead, { color: colors.muted, flex: 1 }]}>
          {displayScenarios.length} scenarios across {chapterGroups.length} chapter
          {chapterGroups.length !== 1 ? "s" : ""}
        </Text>
        {setId ? (
          <Pressable onPress={() => void regenerateScenarios()} hitSlop={8}>
            <Text style={[styles.regen, { color: colors.primary }]}>Regenerate Scenarios</Text>
          </Pressable>
        ) : null}
      </View>

      {chapterGroups.map((group, gi) => (
        <View key={group.chapter} style={styles.chapterBlock}>
          <Text style={[styles.chapterTitle, { color: colors.text }]}>{group.chapter}</Text>
          <Text style={[styles.chapterMeta, { color: colors.muted }]}>
            {group.items.length} scenario{group.items.length !== 1 ? "s" : ""}
          </Text>
          {group.items.map((scenario, i) => {
            const key = `${gi}-${i}`;
            return (
              <ScenarioCard
                key={`${group.chapter}-${i}-${scenario.title}`}
                scenario={scenario}
                index={i}
                open={openIndex === key}
                onToggle={() => setOpenIndex(openIndex === key ? "" : key)}
                colors={colors}
                isDark={isDark}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  lead: { fontSize: 13 },
  regen: { fontSize: 13, fontWeight: "700" },
  chapterBlock: { gap: 8, marginBottom: 8 },
  chapterTitle: { fontSize: 17, fontWeight: "700" },
  chapterMeta: { fontSize: 12, marginBottom: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardHead: { flexDirection: "row", gap: 12, padding: 16, alignItems: "flex-start" },
  num: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  numText: { fontWeight: "800", fontSize: 14 },
  typeLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  section: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  answerWrap: { paddingHorizontal: 16, paddingBottom: 16, paddingLeft: 60 },
  empty: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  loading: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  loadingTitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  loadingBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
