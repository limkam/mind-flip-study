import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { CreateStudyGroupModal } from "../components/studyGroups/CreateStudyGroupModal";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { fetchEntitlementsSnapshot } from "../lib/billing";
import { emitUpgradeLimit } from "../lib/upgradeLimitEvents";
import type { StudyGroupOut } from "../types/api";
import { useAuthStore } from "../store/authStore";

type StudyGroup = StudyGroupOut;

export default function StudyGroupsScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Study Groups");
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const [joinCode, setJoinCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [savedGroup, setSavedGroup] = useState<StudyGroupOut | null>(null);
  const [savedNavigationError, setSavedNavigationError] = useState(false);
  const [createdWithoutDetail, setCreatedWithoutDetail] = useState(false);

  useEffect(() => {
    setShowCreate(false);
    setSavedGroup(null);
    setSavedNavigationError(false);
    setCreatedWithoutDetail(false);
  }, [userId]);
  const entitlements = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const canCreate = !entitlements.isError
    && !entitlements.isFetching
    && entitlements.data?.features.study_group_creation === true;

  const { data: groups = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["study-groups", "mine"],
    queryFn: async () => {
      const { data } = await api.get<StudyGroup[]>("/study-groups/mine");
      return data ?? [];
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post<StudyGroup>("/study-groups/join", { code });
      return data;
    },
    onSuccess: async () => {
      setJoinCode("");
      await queryClient.invalidateQueries({ queryKey: ["study-groups"] });
    },
  });

  return (
    <Screen>
      {header}
      <PageHeader title="Study Groups" subtitle="Learn together with shared materials" />

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Join with code</Text>
        <TextInput
          value={joinCode}
          onChangeText={setJoinCode}
          placeholder="Enter invite code"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
        />
        <Pressable
          style={[styles.btn, { backgroundColor: colors.primary }, !joinCode.trim() && { opacity: 0.5 }]}
          disabled={!joinCode.trim() || joinMutation.isPending}
          onPress={() => joinMutation.mutate(joinCode.trim().toUpperCase())}
        >
          <Text style={styles.btnText}>{joinMutation.isPending ? "Joining…" : "Join group"}</Text>
        </Pressable>
      </View>

      {entitlements.isPending || entitlements.isFetching ? (
        <Text style={[styles.creationStatus, { color: colors.muted }]}>Checking group creation access…</Text>
      ) : entitlements.isError ? (
        <Pressable style={[styles.createToggle, { borderColor: colors.border }]} onPress={() => void entitlements.refetch()}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Could not verify creation access · Retry</Text>
        </Pressable>
      ) : canCreate ? (
        <Pressable style={[styles.createToggle, { borderColor: colors.border }]} onPress={() => setShowCreate(true)}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>+ Create new group</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.createToggle, { borderColor: colors.border }]}
          onPress={() => emitUpgradeLimit({ reason: "Upgrade to create your own study groups." })}
        >
          <Text style={{ color: colors.muted, fontWeight: "700" }}>🔒 Group creation unavailable on this plan</Text>
        </Pressable>
      )}

      <CreateStudyGroupModal
        visible={showCreate && canCreate}
        creationAllowed={canCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (group) => {
          setShowCreate(false);
          setCreatedWithoutDetail(false);
          setSavedGroup(group);
          await queryClient.invalidateQueries({ queryKey: ["study-groups"] }).catch(() => {
            console.warn("[studyGroups] Group created, but the group list could not be invalidated.");
          });
          try {
            router.push(`/study-groups/${group.id}`);
          } catch {
            setSavedNavigationError(true);
          }
        }}
        onCreatedWithoutDetail={async () => {
          setShowCreate(false);
          setCreatedWithoutDetail(true);
          await queryClient.invalidateQueries({ queryKey: ["study-groups"] }).catch(() => {
            console.warn("[studyGroups] Group created, but the group list could not be invalidated.");
          });
        }}
      />

      {createdWithoutDetail ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Group creation accepted</Text>
          <Text style={{ color: colors.muted }}>The group was saved, but its details were unavailable. Check My Groups before trying again.</Text>
          <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => void refetch()}>
            <Text style={styles.btnText}>Refresh My Groups</Text>
          </Pressable>
        </View>
      ) : null}

      {savedNavigationError && savedGroup ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Group created</Text>
          <Text style={{ color: colors.muted }}>Your group was saved, but its page could not be opened.</Text>
          <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => {
            try {
              router.push(`/study-groups/${savedGroup.id}`);
            } catch {
              setSavedNavigationError(true);
            }
          }}>
            <Text style={styles.btnText}>Open saved group</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading groups…</Text>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Could not load" message="Check your connection." actionLabel="Retry" onAction={() => refetch()} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="👥" title="No groups yet" message="Create a group or join with an invite code." />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                void hapticImpact("light");
                router.push(`/study-groups/${item.id}`);
              }}
            >
              <Text style={[styles.groupName, { color: colors.text }]}>{item.name}</Text>
              {item.description ? (
                <Text style={[styles.groupMeta, { color: colors.muted }]} numberOfLines={2}>{item.description}</Text>
              ) : null}
              <Text style={[styles.groupMeta, { color: colors.muted }]}>
                {item.member_count} members{item.code ? ` · Code ${item.code}` : ""}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, fontSize: 15 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", minHeight: 44, justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  createToggle: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderWidth: 1, borderRadius: 10, alignItems: "center" },
  creationStatus: { marginHorizontal: 16, marginBottom: 12, textAlign: "center", fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 24 },
  groupCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  groupName: { fontSize: 16, fontWeight: "700" },
  groupMeta: { fontSize: 13, marginTop: 4 },
});
