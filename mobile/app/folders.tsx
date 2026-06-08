import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
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
import type { FolderOut } from "../types/api";

export default function FoldersScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Collections");
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [viewing, setViewing] = useState<FolderOut | null>(null);

  const { data: folders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const { data } = await api.get<FolderOut[]>("/folders/");
      return (data ?? []).filter((f) => Boolean(f?.id));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (folderName: string) => {
      await api.post("/folders/", { name: folderName });
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/folders/${id}`);
    },
    onSuccess: async () => {
      setViewing(null);
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  return (
    <Screen keyboard={createOpen}>
      {header}
      <View style={styles.headerRow}>
        <PageHeader title="Collections" subtitle="Organize books and flashcard sets" />
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            setCreateOpen(true);
          }}
        >
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load collections"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(f) => f.id}
          contentContainerStyle={folders.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="📁"
              title="No folders yet"
              message="Create folders to group your books and flashcard sets."
              actionLabel="Create folder"
              onAction={() => setCreateOpen(true)}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                void hapticImpact("light");
                setViewing(item);
              }}
            >
              <Text style={styles.folderIcon}>{item.icon || "📁"}</Text>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.cardMeta, { color: colors.muted }]}>
                  {item.book_ids.length} books · {item.flashcard_set_ids.length} sets
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={createOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New folder</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Folder name"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
            {createMutation.isError ? (
              <Text style={{ color: colors.danger, marginTop: 8 }}>Could not create folder</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.addBtn, createMutation.isPending && { opacity: 0.6 }]}
                disabled={!name.trim() || createMutation.isPending}
                onPress={() => createMutation.mutate(name.trim())}
              >
                <Text style={styles.addBtnText}>{createMutation.isPending ? "Saving…" : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewing} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.folderIconLarge}>{viewing?.icon || "📁"}</Text>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{viewing?.name}</Text>
            {viewing?.description ? (
              <Text style={[styles.cardMeta, { color: colors.muted, marginBottom: 12 }]}>{viewing.description}</Text>
            ) : null}
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {viewing?.book_ids.length ?? 0} books · {viewing?.flashcard_set_ids.length ?? 0} sets
            </Text>
            <View style={[styles.modalActions, { marginTop: 20 }]}>
              <Pressable onPress={() => setViewing(null)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert("Delete folder?", "This cannot be undone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => viewing && deleteMutation.mutate(viewing.id),
                    },
                  ])
                }
              >
                <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingRight: 16,
  },
  addBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1 },
  center: { textAlign: "center", marginTop: 32 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  folderIcon: { fontSize: 28 },
  folderIconLarge: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardMeta: { fontSize: 13, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    minHeight: 44,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, alignItems: "center" },
});
