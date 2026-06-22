import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useScreenHeader } from "../../hooks/useScreenHeader";
import { useTheme } from "../../hooks/useTheme";

type GroupDetail = {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  member_count: number;
  weekly_card_goal: number;
  progress_pct: number;
  cards_this_week: number;
  members: { full_name: string; cards_this_week: number; role: string }[];
  materials: { title: string; author?: string }[];
};

export default function StudyGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const { colors } = useTheme();
  const header = useScreenHeader("Group");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["study-group", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data: detail } = await api.get<GroupDetail>(`/study-groups/${groupId}`);
      return detail;
    },
  });

  return (
    <Screen>
      {header}
      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : isError || !data ? (
        <EmptyState icon="⚠️" title="Could not load group" actionLabel="Retry" onAction={() => refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: colors.text }]}>{data.name}</Text>
          {data.description ? <Text style={[styles.sub, { color: colors.muted }]}>{data.description}</Text> : null}
          {data.code ? (
            <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Invite code: {data.code}</Text>
            </View>
          ) : null}
          <Text style={[styles.stat, { color: colors.text }]}>
            Weekly progress: {data.cards_this_week} / {data.weekly_card_goal} cards ({data.progress_pct}%)
          </Text>
          <Text style={[styles.section, { color: colors.text }]}>Members ({data.member_count})</Text>
          {data.members.map((m) => (
            <View key={m.full_name} style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{m.full_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{m.cards_this_week} cards this week</Text>
            </View>
          ))}
          <Text style={[styles.section, { color: colors.text }]}>Materials</Text>
          {data.materials.length === 0 ? (
            <Text style={{ color: colors.muted }}>No books added yet.</Text>
          ) : (
            data.materials.map((mat) => (
              <View key={mat.title} style={[styles.row, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text }}>{mat.title}</Text>
                {mat.author ? <Text style={{ color: colors.muted, fontSize: 13 }}>{mat.author}</Text> : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 32 },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  sub: { fontSize: 15, marginBottom: 12, lineHeight: 22 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  stat: { fontSize: 15, fontWeight: "600", marginBottom: 16 },
  section: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  row: { borderBottomWidth: 1, paddingVertical: 10 },
});
