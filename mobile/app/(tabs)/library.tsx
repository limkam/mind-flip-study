import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Link } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { LibrarySkeleton } from "../../components/skeletons/LibrarySkeleton";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { flattenPages, normalizePage } from "../../lib/pagination";
import { uploadBookFromPicker } from "../../lib/uploadBook";
import type { BookOut, Paginated } from "../../types/api";

const PAGE_SIZE = 20;

export default function LibraryTab() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [picked, setPicked] = useState<{
    uri: string;
    name: string;
    size: number;
    mimeType?: string | null;
  } | null>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ["books", "paginated"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<BookOut> | BookOut[]>("/books/", {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return normalizePage(data, pageParam, PAGE_SIZE);
    },
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });

  const books = flattenPages(data?.pages);
  const total = data?.pages[0]?.total ?? 0;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!picked || !title.trim() || !author.trim()) {
        throw new Error("Pick a file and enter title and author.");
      }
      await uploadBookFromPicker({
        title: title.trim(),
        author: author.trim(),
        uri: picked.uri,
        size: picked.size,
        name: picked.name,
        mimeType: picked.mimeType ?? "application/pdf",
      });
    },
    onSuccess: async () => {
      setUploadOpen(false);
      setTitle("");
      setAuthor("");
      setPicked(null);
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    let size = a.size ?? 0;
    if (!size) {
      const info = await FileSystem.getInfoAsync(a.uri);
      if (info.exists && "size" in info) {
        size = info.size;
      }
    }
    setPicked({
      uri: a.uri,
      name: a.name,
      size,
      mimeType: a.mimeType,
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: BookOut }) => (
      <Link href={`/book/${item.id}`} asChild>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => void hapticImpact("light")}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.cardMeta, { color: colors.muted }]}>{item.author}</Text>
          <Text style={[styles.cardMeta, { color: colors.muted }]}>{item.status}</Text>
        </Pressable>
      </Link>
    ),
    [colors],
  );

  if (isLoading) {
    return (
      <Screen>
        <LibrarySkeleton />
      </Screen>
    );
  }

  return (
    <Screen keyboard={uploadOpen}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Library</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>{total} books</Text>
        </View>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            setUploadOpen(true);
          }}
        >
          <Text style={styles.primaryBtnText}>Upload</Text>
        </Pressable>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        extraData={books.length}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        contentContainerStyle={books.length === 0 ? styles.emptyList : { paddingBottom: 32, gap: 10 }}
        ListEmptyComponent={
          <EmptyState
            icon="📚"
            title="No books yet"
            message="Upload your first PDF to generate AI flashcards and workbooks."
            actionLabel="Upload book"
            onAction={() => setUploadOpen(true)}
          />
        }
      />

      <Modal visible={uploadOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Upload book</Text>
            <Text style={[styles.label, { color: colors.muted }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
            <Text style={[styles.label, { color: colors.muted }]}>Author</Text>
            <TextInput
              value={author}
              onChangeText={setAuthor}
              placeholder="Author"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
            <Pressable style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={pickFile}>
              <Text style={{ color: colors.text }}>{picked ? picked.name : "Choose PDF"}</Text>
            </Pressable>
            {uploadMutation.isError ? (
              <Text style={{ color: colors.danger, marginTop: 8 }}>
                {(uploadMutation.error as Error)?.message || "Upload failed"}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setUploadOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, uploadMutation.isPending && { opacity: 0.6 }]}
                disabled={uploadMutation.isPending}
                onPress={() => uploadMutation.mutate()}
              >
                <Text style={styles.primaryBtnText}>
                  {uploadMutation.isPending ? "Uploading…" : "Start upload"}
                </Text>
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { fontSize: 14, marginTop: 4 },
  emptyList: { flexGrow: 1 },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { fontSize: 13, marginTop: 4 },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 96,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  label: { marginTop: 10, fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    minHeight: 44,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
  ghostBtn: { paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
});
