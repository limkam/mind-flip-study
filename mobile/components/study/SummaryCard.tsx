import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../hooks/useTheme";

export type ChapterSummary = {
  chapter: string;
  overview?: string;
  core_concept?: string;
  key_points?: string[];
  common_mistakes?: string[];
  difficulty?: string;
};

const DIFFICULTY: Record<string, { label: string; color: string }> = {
  beginner: { label: "Beginner", color: "#047857" },
  intermediate: { label: "Intermediate", color: "#b45309" },
  advanced: { label: "Advanced", color: "#b91c1c" },
};

type Props = ChapterSummary & { defaultOpen?: boolean };

export function SummaryCard({
  chapter,
  overview,
  core_concept,
  key_points = [],
  common_mistakes = [],
  difficulty,
  defaultOpen = false,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultOpen);
  const diff = difficulty ? DIFFICULTY[difficulty] : null;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{chapter}</Text>
          {diff ? (
            <Text style={[styles.badge, { color: diff.color, borderColor: diff.color }]}>{diff.label}</Text>
          ) : null}
          <Text style={styles.headerMeta}>
            {key_points.length} key points
            {common_mistakes.length > 0 ? ` · ${common_mistakes.length} pitfalls` : ""}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {core_concept ? (
            <Section title="Core concept" colors={colors}>
              <Text style={[styles.text, { color: colors.text }]}>{core_concept}</Text>
            </Section>
          ) : null}
          {overview ? (
            <Section title="Overview" colors={colors}>
              <Text style={[styles.text, { color: colors.text }]}>{overview}</Text>
            </Section>
          ) : null}
          {key_points.length > 0 ? (
            <Section title="Key points" colors={colors}>
              {key_points.map((point, i) => (
                <Text key={i} style={[styles.bullet, { color: colors.text }]}>
                  {i + 1}. {point}
                </Text>
              ))}
            </Section>
          ) : null}
          {common_mistakes.length > 0 ? (
            <Section title="Watch out for" colors={colors}>
              {common_mistakes.map((mistake, i) => (
                <Text key={i} style={[styles.bullet, { color: colors.text }]}>
                  ! {mistake}
                </Text>
              ))}
            </Section>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: ReactNode;
  colors: { muted: string; border: string };
}) {
  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#6366f1",
  },
  headerCopy: { flex: 1, gap: 4 },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#fff",
  },
  headerMeta: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  chevron: { color: "#fff", fontSize: 12 },
  body: { padding: 14, gap: 4 },
  section: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  text: { fontSize: 14, lineHeight: 21 },
  bullet: { fontSize: 14, lineHeight: 21, marginBottom: 6 },
});
