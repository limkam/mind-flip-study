import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";

const TYPE_LABELS: Record<string, string> = {
  real_life: "Real-Life Application",
  decision: "Decision-Making",
  professional: "Professional Case Study",
};

export type ScenarioItem = {
  type?: string;
  title: string;
  context?: string;
  challenge?: string;
  question?: string;
  prompt?: string;
  model_answer?: string;
  explanation?: string;
  guidance?: string;
};

type Props = {
  scenarios?: ScenarioItem[];
};

export function ScenarioView({ scenarios = [] }: Props) {
  const { colors } = useTheme();
  const [openIndex, setOpenIndex] = useState(0);

  if (!scenarios.length) {
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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: colors.muted }]}>
        {scenarios.length} scenarios — apply, decide, and analyze concepts from across the document.
      </Text>
      {scenarios.map((scenario, i) => {
        const open = openIndex === i;
        const typeLabel = TYPE_LABELS[scenario.type || ""] || "Scenario";
        const question = scenario.question || scenario.prompt || "";
        return (
          <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable style={styles.cardHead} onPress={() => setOpenIndex(open ? -1 : i)}>
              <View style={[styles.num, { backgroundColor: `${colors.primary}18` }]}>
                <Text style={[styles.numText, { color: colors.primary }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, { color: colors.primary }]}>{typeLabel}</Text>
                <Text style={[styles.title, { color: colors.text }]}>{scenario.title}</Text>
                {scenario.context ? <Text style={[styles.body, { color: colors.muted }]}>{scenario.context}</Text> : null}
                {scenario.challenge ? (
                  <Text style={[styles.body, { color: colors.text }]}>Challenge: {scenario.challenge}</Text>
                ) : null}
                <Text style={[styles.body, { color: colors.text }]}>Question: {question}</Text>
              </View>
              <Text style={{ color: colors.muted }}>{open ? "▲" : "▼"}</Text>
            </Pressable>
            {open && (scenario.model_answer || scenario.explanation || scenario.guidance) ? (
              <View style={styles.answerWrap}>
                {scenario.model_answer ? (
                  <>
                    <Text style={[styles.label, { color: colors.primary }]}>Model answer</Text>
                    <Text style={[styles.body, { color: colors.text }]}>{scenario.model_answer}</Text>
                  </>
                ) : null}
                {scenario.explanation || scenario.guidance ? (
                  <>
                    <Text style={[styles.label, { color: colors.primary, marginTop: 8 }]}>Explanation</Text>
                    <Text style={[styles.body, { color: colors.text }]}>{scenario.explanation || scenario.guidance}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  lead: { fontSize: 13, marginBottom: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardHead: { flexDirection: "row", gap: 12, padding: 16, alignItems: "flex-start" },
  num: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  numText: { fontWeight: "800", fontSize: 14 },
  typeLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  label: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  answerWrap: { paddingHorizontal: 16, paddingBottom: 16, paddingLeft: 60 },
  empty: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
