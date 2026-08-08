import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
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
import { getApiErrorMessage } from "../lib/apiErrors";
import { emitUpgradeLimit } from "../lib/upgradeLimitEvents";
import type { StudyGroupOut } from "../types/api";
import { useAuthStore } from "../store/authStore";

type StudyGroup = StudyGroupOut;

const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 128;
const SEARCH_DEBOUNCE_MS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function isStudyGroup(value: unknown): value is StudyGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Record<string, unknown>;
  return typeof group.id === "string"
    && UUID_PATTERN.test(group.id)
    && typeof group.name === "string"
    && group.name.trim().length > 0
    && (group.description === null || typeof group.description === "string")
    && (group.code === null || typeof group.code === "string")
    && (group.privacy === "public" || group.privacy === "private")
    && Number.isInteger(group.weekly_card_goal)
    && (group.weekly_card_goal as number) >= 1
    && Number.isInteger(group.member_count)
    && (group.member_count as number) >= 0
    && typeof group.cards_this_week === "number"
    && Number.isFinite(group.cards_this_week)
    && typeof group.progress_pct === "number"
    && Number.isFinite(group.progress_pct)
    && typeof group.activity_status === "string"
    && (group.created_at === null || typeof group.created_at === "string")
    && typeof group.is_member === "boolean";
}

function parseSearchResults(value: unknown): StudyGroup[] {
  if (!Array.isArray(value)) throw new Error("The search response was not a list.");
  const results: StudyGroup[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!isStudyGroup(row) || row.privacy !== "public" || seen.has(row.id)) {
      console.warn("[studyGroups] Ignored an invalid, private, or duplicate search result.");
      continue;
    }
    seen.add(row.id);
    results.push(row);
  }
  return results;
}

function parseJoinedGroup(value: unknown): StudyGroup {
  if (!isStudyGroup(value) || value.is_member !== true) {
    throw new Error("MindFlip couldn't open the group you joined. Please try again.");
  }
  return value;
}

export default function StudyGroupsScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Study Groups");
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchUserId, setSearchUserId] = useState<string | undefined>(userId);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchNavigationError, setSearchNavigationError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [savedGroup, setSavedGroup] = useState<StudyGroupOut | null>(null);
  const [savedNavigationError, setSavedNavigationError] = useState(false);
  const [createdWithoutDetail, setCreatedWithoutDetail] = useState(false);
  const joinInputRef = useRef<TextInput>(null);
  const screenScrollRef = useRef<ScrollView>(null);
  const joiningCodeRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const normalizedSearch = searchText.trim();
  const currentSearchRef = useRef(normalizedSearch);
  currentSearchRef.current = normalizedSearch;
  const searchReady = normalizedSearch.length >= SEARCH_MIN_LENGTH
    && normalizedSearch.length <= SEARCH_MAX_LENGTH;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      joiningCodeRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    setJoinCode("");
    setJoinError(null);
    setSearchText("");
    setSearchUserId(userId);
    setDebouncedSearch("");
    setSearchNavigationError(null);
    joiningCodeRef.current = null;
    setShowCreate(false);
    setSavedGroup(null);
    setSavedNavigationError(false);
    setCreatedWithoutDetail(false);
  }, [userId]);

  useEffect(() => {
    if (!searchReady) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(normalizedSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedSearch, searchReady, userId]);
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

  const searchQuery = useQuery({
    queryKey: ["study-groups", "search", userId, debouncedSearch],
    enabled: bootstrapStatus === "authenticated"
      && !!userId
      && searchUserId === userId
      && searchReady
      && debouncedSearch === normalizedSearch,
    queryFn: async () => {
      const { data } = await api.get<unknown>("/study-groups/search", {
        params: { q: debouncedSearch },
      });
      return parseSearchResults(data);
    },
  });

  const joinMutation = useMutation({
    mutationFn: async ({ code, expectedUserId }: { code: string; expectedUserId: string; searchAtStart: string }) => {
      if (useAuthStore.getState().bootstrapStatus !== "authenticated"
        || useAuthStore.getState().user?.id !== expectedUserId) {
        throw new Error("Your session changed before the group could be joined.");
      }
      const { data } = await api.post<unknown>("/study-groups/join", { code });
      return parseJoinedGroup(data);
    },
    onSuccess: async (joinedGroup, variables) => {
      joiningCodeRef.current = null;
      if (!mountedRef.current || useAuthStore.getState().user?.id !== variables.expectedUserId) return;
      setJoinCode("");
      setJoinError(null);
      await queryClient.invalidateQueries({ queryKey: ["study-groups", "mine"] }).catch(() => {
        console.warn("[studyGroups] Joined a group, but My Groups could not be refreshed.");
      });
      await queryClient.invalidateQueries({
        queryKey: ["study-group", joinedGroup.id],
        exact: true,
      }).catch(() => {
        console.warn("[studyGroups] Joined a group, but its cached detail could not be invalidated.");
      });
      if (variables.searchAtStart.length >= SEARCH_MIN_LENGTH
        && currentSearchRef.current === variables.searchAtStart) {
        const activeSearchKey = ["study-groups", "search", variables.expectedUserId, variables.searchAtStart] as const;
        queryClient.setQueryData<StudyGroup[]>(activeSearchKey, (current) => current?.map((group) => (
          group.id === joinedGroup.id ? joinedGroup : group
        )));
      }
    },
    onError: (error: unknown, variables) => {
      joiningCodeRef.current = null;
      if (!mountedRef.current || useAuthStore.getState().user?.id !== variables.expectedUserId) return;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 402) return;
      setJoinError(getApiErrorMessage(error, "The group could not be joined."));
    },
  });

  const submitJoinCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (!userId || bootstrapStatus !== "authenticated" || !code || joiningCodeRef.current) return;
    joiningCodeRef.current = code;
    setJoinError(null);
    joinMutation.mutate({ code, expectedUserId: userId, searchAtStart: normalizedSearch });
  };

  return (
    <Screen>
      {header}
      <ScrollView
        ref={screenScrollRef}
        contentContainerStyle={styles.screenContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
      <PageHeader title="Study Groups" subtitle="Learn together with shared materials" />

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Join with code</Text>
        <TextInput
          ref={joinInputRef}
          value={joinCode}
          onChangeText={(value) => {
            setJoinCode(value);
            setJoinError(null);
          }}
          placeholder="Enter invite code"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
        />
        <Pressable
          style={[styles.btn, { backgroundColor: colors.primary }, !joinCode.trim() && { opacity: 0.5 }]}
          disabled={!joinCode.trim() || joinMutation.isPending || bootstrapStatus !== "authenticated"}
          onPress={submitJoinCode}
        >
          <Text style={styles.btnText}>{joinMutation.isPending ? "Joining…" : "Join group"}</Text>
        </Pressable>
        {joinError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{joinError}</Text> : null}
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
          await queryClient.invalidateQueries({ queryKey: ["study-groups", "mine"] }).catch(() => {
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
          await queryClient.invalidateQueries({ queryKey: ["study-groups", "mine"] }).catch(() => {
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
          <Text style={{ color: colors.muted }}>Your group was saved, but it couldn't be opened.</Text>
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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Search public groups</Text>
        <View style={styles.searchInputRow}>
          <TextInput
            value={searchText}
            onChangeText={(value) => {
              setSearchText(value);
              setSearchUserId(userId);
              setSearchNavigationError(null);
            }}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search by name or description"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search public study groups"
            style={[styles.input, styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          />
          {searchText.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear study group search"
              hitSlop={8}
              onPress={() => {
                setSearchText("");
                setDebouncedSearch("");
                setSearchNavigationError(null);
              }}
              style={[styles.clearButton, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {bootstrapStatus !== "authenticated" || !userId ? (
          <Text style={{ color: colors.muted }}>Finishing sign-in before searching.</Text>
        ) : normalizedSearch.length === 0 ? (
          <Text style={{ color: colors.muted }}>Enter at least 2 characters to find public groups.</Text>
        ) : normalizedSearch.length < SEARCH_MIN_LENGTH ? (
          <Text style={{ color: colors.muted }}>Enter 1 more character to search.</Text>
        ) : debouncedSearch !== normalizedSearch || searchQuery.isPending || searchQuery.isFetching ? (
          <Text style={{ color: colors.muted }}>Searching…</Text>
        ) : searchQuery.isError ? (
          <View style={styles.searchStatus}>
            <Text accessibilityRole="alert" style={{ color: colors.danger }}>Could not search public groups.</Text>
            <Pressable accessibilityRole="button" onPress={() => void searchQuery.refetch()}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        ) : searchQuery.data?.length === 0 ? (
          <Text style={{ color: colors.muted }}>No public groups match your search.</Text>
        ) : (
          <View style={styles.searchResults}>
            {searchQuery.data?.map((group) => (
              <View key={group.id} style={[styles.searchResult, { borderColor: colors.border }]}>
                <View style={styles.searchResultCopy}>
                  <Text style={[styles.groupName, { color: colors.text }]}>{group.name}</Text>
                  {group.description ? <Text numberOfLines={2} style={[styles.groupMeta, { color: colors.muted }]}>{group.description}</Text> : null}
                  <Text style={[styles.groupMeta, { color: colors.muted }]}>
                    {group.member_count} {group.member_count === 1 ? "member" : "members"} · Goal {group.weekly_card_goal} cards/week
                  </Text>
                </View>
                {group.is_member ? (
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.resultAction, { borderColor: colors.primary }]}
                    onPress={() => {
                      setSearchNavigationError(null);
                      try {
                        router.push(`/study-groups/${group.id}`);
                      } catch {
                        setSearchNavigationError(group.id);
                      }
                    }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>Open</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="An invite code is required to join this group"
                    style={[styles.resultAction, { borderColor: colors.border }]}
                    onPress={() => {
                      screenScrollRef.current?.scrollTo({ y: 0, animated: true });
                      joinInputRef.current?.focus();
                    }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>Use invite code</Text>
                  </Pressable>
                )}
                {!group.is_member ? (
                  <Text style={[styles.inviteHelp, { color: colors.muted }]}>Ask the group owner for its invite code, then enter it above.</Text>
                ) : null}
                {searchNavigationError === group.id ? (
                  <Text accessibilityRole="alert" style={{ color: colors.danger }}>This group couldn't be opened. Try again.</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.myGroupsTitle, { color: colors.text }]}>My Groups</Text>
      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading groups…</Text>
      ) : isError ? (
        <EmptyState icon="⚠️" title="Could not load" message="Check your connection." actionLabel="Retry" onAction={() => refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon="👥" title="No groups yet" message="Create a group or join with an invite code." />
      ) : (
        <View style={styles.list}>
          {groups.map((item) => (
            <Pressable
              key={item.id}
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
          ))}
        </View>
      )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 32 },
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
  searchInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1 },
  clearButton: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchStatus: { gap: 8 },
  searchResults: { gap: 10 },
  searchResult: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  searchResultCopy: { flex: 1 },
  resultAction: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  inviteHelp: { fontSize: 12 },
  myGroupsTitle: { marginHorizontal: 16, marginBottom: 10, fontSize: 18, fontWeight: "800" },
});
