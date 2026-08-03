import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { AttachStudyGroupBookModal } from "../../components/studyGroups/AttachStudyGroupBookModal";
import { api } from "../../api/client";
import { useScreenHeader } from "../../hooks/useScreenHeader";
import { useTheme } from "../../hooks/useTheme";
import { parseStudyGroupDetail, UUID_PATTERN } from "../../lib/studyGroupMaterials";
import { useAuthStore } from "../../store/authStore";

export default function StudyGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const { colors } = useTheme();
  const header = useScreenHeader("Group");
  const userId = useAuthStore((state) => state.user?.id);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  useEffect(() => {
    setPickerOpen(false);
    setAttachmentNotice(null);
  }, [groupId, userId]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["study-group", groupId],
    enabled: !!userId
      && bootstrapStatus === "authenticated"
      && !!groupId
      && UUID_PATTERN.test(groupId),
    queryFn: async () => {
      const expectedUserId = userId;
      if (!expectedUserId || useAuthStore.getState().user?.id !== expectedUserId) {
        throw new Error("The authenticated user changed before group detail could load.");
      }
      const { data: detail } = await api.get<unknown>(`/study-groups/${groupId}`);
      if (useAuthStore.getState().user?.id !== expectedUserId) {
        throw new Error("The authenticated user changed while group detail was loading.");
      }
      return { ...parseStudyGroupDetail(detail), authorized_user_id: expectedUserId };
    },
  });
  const canAttachMaterials = data?.is_member === true && data.authorized_user_id === userId;
  const attachedBookIds = new Set(data?.materials.map((material) => material.book_id) ?? []);
  const authReady = bootstrapStatus === "authenticated" && !!userId;

  return (
    <Screen>
      {header}
      {!authReady || isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : !data ? (
        <EmptyState icon="⚠️" title="Could not load group" message="This group may be unavailable, or your connection may have failed." actionLabel="Retry" onAction={() => refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {isError ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>Could not refresh the latest group details. The information below may be out of date.</Text>
              <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry group refresh</Text>
              </Pressable>
            </View>
          ) : null}
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
          {data.has_incomplete_materials ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>Some materials could not be displayed.</Text>
              <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry materials</Text>
              </Pressable>
            </View>
          ) : null}
          {attachmentNotice ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>{attachmentNotice}</Text>
              <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Refresh materials</Text>
              </Pressable>
            </View>
          ) : null}
          {data.materials.length === 0 ? (
            <Text style={{ color: colors.muted }}>No books added yet.</Text>
          ) : (
            data.materials.map((mat) => (
              <View key={mat.id} style={[styles.row, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{mat.title}</Text>
                {mat.author ? <Text style={{ color: colors.muted, fontSize: 13 }}>{mat.author}</Text> : null}
                <Text style={{ color: colors.muted, fontSize: 12 }}>Added by {mat.added_by_name}</Text>
              </View>
            ))
          )}
          {canAttachMaterials ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach a book to this study group"
              onPress={() => {
                setAttachmentNotice(null);
                setPickerOpen(true);
              }}
              style={[styles.attachButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.attachButtonText}>Attach book</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
      <AttachStudyGroupBookModal
        visible={pickerOpen}
        groupId={groupId ?? ""}
        authorized={canAttachMaterials}
        attachedBookIds={attachedBookIds}
        onClose={() => setPickerOpen(false)}
        onAccepted={(result, refreshFailed) => {
          setPickerOpen(false);
          if (refreshFailed) {
            setAttachmentNotice("The book was attached, but materials could not be refreshed. Try refreshing again.");
          } else if (result.status === "accepted_without_detail") {
            setAttachmentNotice("The attachment was accepted and materials were refreshed from the group.");
          } else {
            setAttachmentNotice(`${result.material.title} was attached to the group.`);
          }
        }}
      />
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
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8, marginBottom: 8 },
  attachButton: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 14 },
  attachButtonText: { color: "#fff", fontWeight: "800" },
});
