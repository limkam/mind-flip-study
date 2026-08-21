import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/Screen";
import { AttachStudyGroupBookModal } from "../../components/studyGroups/AttachStudyGroupBookModal";
import { api } from "../../api/client";
import { useScreenHeader } from "../../hooks/useScreenHeader";
import { useTheme } from "../../hooks/useTheme";
import {
  parseStudyGroupDetail,
  StudyGroupDetailContractError,
  UUID_PATTERN,
  type ParsedStudyGroupDetail,
} from "../../lib/studyGroupMaterials";
import { useAuthStore } from "../../store/authStore";

type DetailQueryResult =
  | { status: "detail"; detail: ParsedStudyGroupDetail; authorizedUserId: string }
  | { status: "forbidden" }
  | { status: "not_found" };

function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

function initialErrorCopy(error: unknown): { title: string; message: string } {
  if (error instanceof StudyGroupDetailContractError) {
    return {
      title: "Could not display group",
      message: "Bilkeys couldn't display this group's details. Please try again.",
    };
  }
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status && status >= 500) {
    return { title: "Could not load group", message: "The group service is temporarily unavailable." };
  }
  if (isNetworkFailure(error)) {
    return { title: "Could not load group", message: "Check your connection and try again." };
  }
  return { title: "Could not load group", message: "The group could not be loaded. Try again." };
}

function retainedErrorMessage(error: unknown): string {
  if (error instanceof StudyGroupDetailContractError) {
    return "Bilkeys couldn't refresh this group. The last available details are still shown.";
  }
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status && status >= 500) return "This group couldn't be refreshed right now. The last available details are still shown.";
  if (isNetworkFailure(error)) return "The group could not be refreshed. Check your connection; the last validated details are still shown.";
  return "The group could not be refreshed. Showing the last validated details.";
}

export default function StudyGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const { colors } = useTheme();
  const header = useScreenHeader("Group");
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  useEffect(() => {
    setPickerOpen(false);
    setAttachmentNotice(null);
  }, [groupId, userId]);

  const validGroupId = typeof groupId === "string" && UUID_PATTERN.test(groupId);
  const detailQuery = useQuery<DetailQueryResult>({
    queryKey: ["study-group", groupId],
    enabled: !!userId
      && bootstrapStatus === "authenticated"
      && validGroupId,
    queryFn: async () => {
      const expectedUserId = userId;
      if (!expectedUserId || useAuthStore.getState().user?.id !== expectedUserId) {
        throw new Error("The authenticated user changed before group detail could load.");
      }
      let response: unknown;
      try {
        ({ data: response } = await api.get<unknown>(`/study-groups/${groupId}`));
      } catch (error: unknown) {
        if (useAuthStore.getState().user?.id !== expectedUserId) {
          throw new Error("The authenticated user changed while group detail was loading.");
        }
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 403) return { status: "forbidden" };
        if (status === 404) return { status: "not_found" };
        throw error;
      }
      if (useAuthStore.getState().user?.id !== expectedUserId) {
        throw new Error("The authenticated user changed while group detail was loading.");
      }
      return {
        status: "detail",
        detail: parseStudyGroupDetail(response, groupId),
        authorizedUserId: expectedUserId,
      };
    },
  });
  const detailResult = detailQuery.data?.status === "detail"
    && detailQuery.data.authorizedUserId === userId
    ? detailQuery.data
    : null;
  const data = detailResult?.detail;
  const canAttachMaterials = data?.is_member === true && detailResult?.authorizedUserId === userId;
  const currentMembership = data?.members.find((member) => member.user_id === userId);
  const membershipLabel = currentMembership?.role === "owner" ? "Owner" : data?.is_member ? "Member" : null;
  const attachedBookIds = new Set(data?.materials.map((material) => material.book_id) ?? []);
  const authReady = bootstrapStatus === "authenticated" && !!userId;
  const goBackToGroups = () => router.replace("/study-groups");
  const loadErrorCopy = initialErrorCopy(detailQuery.error);

  return (
    <Screen>
      {header}
      {!validGroupId ? (
        <DetailFailure
          title="Invalid group link"
          message="This study-group link is not valid."
          onBack={goBackToGroups}
          colors={colors}
        />
      ) : !authReady || detailQuery.isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : detailQuery.data?.status === "forbidden" ? (
        <DetailFailure
          title="Members only"
          message="You are not a member of this study group. Join with an invite code before opening its details."
          onBack={goBackToGroups}
          colors={colors}
        />
      ) : detailQuery.data?.status === "not_found" ? (
        <DetailFailure
          title="Group not found"
          message="This study group no longer exists or the link is no longer valid."
          onBack={goBackToGroups}
          colors={colors}
        />
      ) : !data ? (
        <DetailFailure
          title={loadErrorCopy.title}
          message={loadErrorCopy.message}
          onRetry={() => void detailQuery.refetch()}
          onBack={goBackToGroups}
          colors={colors}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={detailQuery.isRefetching} onRefresh={() => void detailQuery.refetch()} tintColor={colors.primary} />}
        >
          {detailQuery.isError ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>{retainedErrorMessage(detailQuery.error)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void detailQuery.refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry group refresh</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{data.name}</Text>
            {membershipLabel ? (
              <View style={[styles.membershipBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{membershipLabel}</Text>
              </View>
            ) : null}
          </View>
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
            <View key={m.user_id} style={[styles.row, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{m.full_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{m.cards_this_week} cards this week</Text>
            </View>
          ))}
          <Text style={[styles.section, { color: colors.text }]}>Materials</Text>
          {data.has_incomplete_materials ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>Some materials could not be displayed.</Text>
              <Pressable accessibilityRole="button" onPress={() => void detailQuery.refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry materials</Text>
              </Pressable>
            </View>
          ) : null}
          {attachmentNotice ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text accessibilityRole="alert" style={{ color: colors.text }}>{attachmentNotice}</Text>
              <Pressable accessibilityRole="button" onPress={() => void detailQuery.refetch()}>
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

function DetailFailure({
  title,
  message,
  onRetry,
  onBack,
  colors,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onBack: () => void;
  colors: { text: string; muted: string; primary: string; border: string; surface: string };
}) {
  return (
    <View style={styles.failure}>
      <Text accessibilityRole="header" style={[styles.failureTitle, { color: colors.text }]}>{title}</Text>
      <Text accessibilityRole="alert" style={[styles.failureMessage, { color: colors.muted }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading study group"
          onPress={onRetry}
          style={[styles.failureAction, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.failurePrimaryText}>Retry</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to study groups"
        onPress={onBack}
        style={[styles.failureAction, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
      >
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Back to Study Groups</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 32 },
  failure: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 12 },
  failureTitle: { fontSize: 21, fontWeight: "800", textAlign: "center" },
  failureMessage: { fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 4 },
  failureAction: { minHeight: 46, minWidth: 220, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  failurePrimaryText: { color: "#fff", fontWeight: "800" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  membershipBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  sub: { fontSize: 15, marginBottom: 12, lineHeight: 22 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  stat: { fontSize: 15, fontWeight: "600", marginBottom: 16 },
  section: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  row: { borderBottomWidth: 1, paddingVertical: 10 },
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8, marginBottom: 8 },
  attachButton: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 14 },
  attachButtonText: { color: "#fff", fontWeight: "800" },
});
