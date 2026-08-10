import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";

export type WeakTopic = { set_id: string; title: string; avg_score: number };

type Props = {
  topics: WeakTopic[];
};

export function WeakTopicsChips({ topics }: Props) {
  const { colors } = useTheme();
  if (!topics.length) return null;
  const slice = topics.slice(0, 8);
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.text }]}>Topics to review</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>Weaker recent quiz scores — open the set to study</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {slice.map((t) => (
          <Link key={`${t.set_id}-${t.title}`} href={`/study/${t.set_id}`} asChild>
            <Pressable style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? colors.surfaceElevated : colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.chipTitle, { color: colors.text }]} numberOfLines={2}>
                {t.title}
              </Text>
              <Text style={[styles.chipPct, { color: colors.muted }]}>{Math.round(t.avg_score)}%</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  heading: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 4, marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipTitle: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  chipPct: { fontSize: 12 },
});
