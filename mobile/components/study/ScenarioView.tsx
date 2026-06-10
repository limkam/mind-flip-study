import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";

export type ScenarioItem = {
  title: string;
  prompt: string;
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
        {scenarios.length} scenario{scenarios.length !== 1 ? "s" : ""} — apply what you learned to realistic situations.
      </Text>
      {scenarios.map((scenario, i) => {
        const open = openIndex === i;
        return (
          <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable style={styles.cardHead} onPress={() => setOpenIndex(open ? -1 : i)}>
              <View style={[styles.num, { backgroundColor: `${colors.primary}18` }]}>
                <Text style={[styles.numText, { color: colors.primary }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>{scenario.title}</Text>
                <Text style={[styles.prompt, { color: colors.muted }]}>{scenario.prompt}</Text>
              </View>
              <Text style={{ color: colors.muted }}>{open ? "▲" : "▼"}</Text>
            </Pressable>
            {open && scenario.guidance ? (
              <View style={styles.guidanceWrap}>
                <Text style={[styles.guidanceLabel, { color: colors.primary }]}>Strong answer should cover</Text>
                <Text style={[styles.guidance, { color: colors.text }]}>{scenario.guidance}</Text>
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
  title: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  prompt: { fontSize: 14, lineHeight: 20 },
  guidanceWrap: { paddingHorizontal: 16, paddingBottom: 16, paddingLeft: 60 },
  guidanceLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  guidance: { fontSize: 14, lineHeight: 20 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
