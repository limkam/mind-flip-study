import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";

type StudyGroup = {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  member_count: number;
  progress_pct?: number;
  is_member?: boolean;
};

export default function StudyGroupsScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Study Groups");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [joinCode, setJoinCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<StudyGroup>("/study-groups/", {
        name: name.trim(),
        description: description.trim() || null,
        privacy: "public",
        weekly_card_goal: 20,
        book_ids: [],
      });
      return data;
    },
    onSuccess: async (group) => {
      setShowCreate(false);
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      router.push(`/study-groups/${group.id}`);
    },
  });

  return (
    <Screen keyboard={showCreate}>
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

      <Pressable
        style={[styles.createToggle, { borderColor: colors.border }]}
        onPress={() => setShowCreate((v) => !v)}
      >
        <Text style={{ color: colors.primary, fontWeight: "700" }}>
          {showCreate ? "Cancel create" : "+ Create new group"}
        </Text>
      </Pressable>

      {showCreate ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          />
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }, name.trim().length < 2 && { opacity: 0.5 }]}
            disabled={name.trim().length < 2 || createMutation.isPending}
            onPress={() => createMutation.mutate()}
          >
            <Text style={styles.btnText}>{createMutation.isPending ? "Creating…" : "Create group"}</Text>
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
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { textAlign: "center", marginTop: 24 },
  groupCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  groupName: { fontSize: 16, fontWeight: "700" },
  groupMeta: { fontSize: 13, marginTop: 4 },
});
