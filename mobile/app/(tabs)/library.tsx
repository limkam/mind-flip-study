import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../../api/client";
import { LibrarySkeleton } from "../../components/skeletons/LibrarySkeleton";
import { Screen } from "../../components/Screen";
import { SetActionSheet, type SetActionSheetAction } from "../../components/library/SetActionSheet";
import { TagEditModal } from "../../components/library/TagEditModal";
import { AppButton, AppTextInput, IconButton, Segmented, StackCard } from "../../components/ui";
import type { SegmentedOption } from "../../components/ui/Segmented";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { coverTintFor } from "../../lib/coverTint";
import { deleteFlashcardSet, fetchFlashcardSetsList, updateFlashcardSetTags } from "../../lib/flashcardSets";
import { formatFileSize, estimatePageCount } from "../../lib/formatFileSize";
import { sha256FileUri } from "../../lib/fileHash";
import { hapticImpact } from "../../lib/haptics";
import { flattenPages, normalizePage } from "../../lib/pagination";
import { titleFromFilename, uploadBookFromPicker } from "../../lib/uploadBook";
import { useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";
import type { BookOut, FlashcardSetOut, Paginated } from "../../types/api";

const PAGE_SIZE = 20;
const BOOK_COVER_WIDTH = 60;
const BOOK_COVER_HEIGHT = 80;
const SET_SWATCH_SIZE = 60;

type Filter = "all" | "books" | "sets";
type LibraryItem =
  | { kind: "heading"; id: "books" | "sets"; label: string }
  | { kind: "book"; value: BookOut }
  | { kind: "set"; value: FlashcardSetOut };

const FILTER_OPTIONS: SegmentedOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "books", label: "Books" },
  { value: "sets", label: "Sets" },
];

function BookRow({ book }: { book: BookOut }) {
  const { colors } = useTheme();
  const tint = coverTintFor(book.id, colors);
  const initial = book.title.trim().charAt(0).toUpperCase() || "?";
  const meta = book.is_analyzing
    ? "Preparing chapters"
    : book.table_of_contents?.length
      ? `${book.table_of_contents.length} chapter${book.table_of_contents.length === 1 ? "" : "s"}`
      : null;

  return (
    <Pressable
      onPress={() => router.push(`/book/${book.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Book, ${book.title}, by ${book.author}`}
    >
      <View style={[styles.bookCover, { backgroundColor: tint.bg }]}>
        <View style={[styles.bookSpine, { backgroundColor: tint.fg }]} />
        <Text style={[styles.bookCoverGlyph, { color: tint.fg }]}>{initial}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{book.title}</Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {book.author}{meta ? ` · ${meta}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function SetRow({
  set,
  onMenu,
  menuDisabled,
}: {
  set: FlashcardSetOut;
  onMenu: (set: FlashcardSetOut) => void;
  menuDisabled?: boolean;
}) {
  const { colors } = useTheme();
  const tint = coverTintFor(set.id, colors);

  return (
    <Pressable
      onPress={() => router.push(`/study/${set.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Flashcard set, ${set.title}, ${set.card_count} cards`}
    >
      <StackCard
        width={SET_SWATCH_SIZE}
        height={SET_SWATCH_SIZE}
        radius={TOKENS.radii.md}
        peekTop={8}
        farInset={5}
        nearInset={2}
        nearOffset={3}
      >
        <View style={[styles.setSwatch, { backgroundColor: tint.bg }]}>
          <Ionicons name="albums" size={22} color={tint.fg} />
        </View>
      </StackCard>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{set.title}</Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {set.card_count} card{set.card_count === 1 ? "" : "s"}{set.book_title ? ` · ${set.book_title}` : ""}
        </Text>
      </View>
      <Ionicons name="play-circle-outline" size={22} color={colors.primary} />
      <IconButton
        icon="ellipsis-vertical"
        size="sm"
        variant="ghost"
        disabled={menuDisabled}
        accessibilityLabel={`More actions for ${set.title}`}
        onPress={() => onMenu(set)}
      />
    </Pressable>
  );
}

export default function LibraryTab() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ create?: string }>();
  const refreshLock = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [picked, setPicked] = useState<{ uri: string; name: string; size: number; mimeType?: string | null } | null>(null);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [detectHint, setDetectHint] = useState<string | null>(null);

  // Flashcard set actions (edit tags / delete / games), surfaced via SetRow's overflow menu.
  const user = useAuthStore((s) => s.user);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const [editingSet, setEditingSet] = useState<FlashcardSetOut | null>(null);
  const [savingTags, setSavingTags] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [menuSet, setMenuSet] = useState<FlashcardSetOut | null>(null);
  const isMountedRef = useRef(true);
  const editingSetRef = useRef<FlashcardSetOut | null>(null);
  const saveInFlightRef = useRef(false);
  const saveAttemptIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const closeCreation = useCallback(() => {
    setUploadOpen(false);
    setTitle("");
    setAuthor("");
    setPicked(null);
    setUploadPhase(null);
    setDetectHint(null);
  }, []);

  useEffect(() => {
    if (params.create !== "1") return;
    setUploadOpen(true);
    router.setParams({ create: "" });
  }, [params.create]);

  const booksQuery = useInfiniteQuery({
    queryKey: ["books", "infinite"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<BookOut> | BookOut[]>("/books/", { params: { page: pageParam, size: PAGE_SIZE } });
      return normalizePage(data, pageParam, PAGE_SIZE);
    },
    getNextPageParam: (last) => (last?.has_more ? last.page + 1 : undefined),
  });
  const setsQuery = useQuery({ queryKey: ["flashcard-sets"], queryFn: fetchFlashcardSetsList });
  const books = flattenPages(booksQuery.data?.pages);
  const sets = setsQuery.data ?? [];
  const totalBooks = booksQuery.data?.pages?.[0]?.total ?? books.length;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const items = useMemo<LibraryItem[]>(() => {
    const bookItems = filter === "sets" ? [] : books
      .filter((book) => !normalizedQuery || `${book.title} ${book.author}`.toLocaleLowerCase().includes(normalizedQuery))
      .map((value) => ({ kind: "book" as const, value }));
    const setItems = filter === "books" ? [] : sets
      .filter((set) => !normalizedQuery || `${set.title} ${set.book_title ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
      .map((value) => ({ kind: "set" as const, value }));
    if (filter !== "all") return [...bookItems, ...setItems];
    return [
      ...(bookItems.length ? [{ kind: "heading" as const, id: "books" as const, label: "Books" }, ...bookItems] : []),
      ...(setItems.length ? [{ kind: "heading" as const, id: "sets" as const, label: "Flashcard sets" }, ...setItems] : []),
    ];
  }, [books, filter, normalizedQuery, sets]);

  const uploadPhaseLabel = uploadPhase === "uploading" ? "Uploading document…" : uploadPhase === "creating" ? "Adding to your library…" : null;
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!picked || !title.trim() || !author.trim()) throw new Error("Choose a PDF and enter its title and author.");
      return uploadBookFromPicker({
        title: title.trim(),
        author: author.trim(),
        uri: picked.uri,
        size: picked.size,
        name: picked.name,
        mimeType: picked.mimeType ?? "application/pdf",
        operationId: crypto.randomUUID(),
        onProgress: setUploadPhase,
      });
    },
    onSuccess: async (book) => {
      closeCreation();
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      if (book?.id) router.push(`/book/${book.id}`);
    },
    onError: (error: unknown) => {
      setUploadPhase(null);
      const response = error as { response?: { status?: number; data?: { detail?: string } } };
      if (response.response?.status === 402) return;
      if (response.response?.status === 409) Alert.alert("Already in your library", "This document has already been added.");
    },
  });

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    let size = asset.size ?? 0;
    if (!size) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (info.exists && "size" in info) size = info.size;
    }
    setPicked({ uri: asset.uri, name: asset.name, size, mimeType: asset.mimeType });
    setTitle(titleFromFilename(asset.name));
    setAuthor("");
    setDetectHint("Check the title and add the author before uploading.");
  }, []);

  const upload = useCallback(async () => {
    if (!picked) { await pickFile(); return; }
    if (!title.trim() || !author.trim()) return;
    try {
      const hash = await sha256FileUri(picked.uri);
      const { data } = await api.get<{ is_duplicate: boolean; matches: { title: string; author: string }[] }>("/books/check-duplicate", {
        params: { title: title.trim(), file_sha256: hash, file_size_bytes: picked.size },
      });
      if (data.is_duplicate && data.matches[0]) {
        Alert.alert("Already in your library", `Open “${data.matches[0].title}” instead.`);
        return;
      }
    } catch {
      // The server remains authoritative if this convenience check is unavailable.
    }
    uploadMutation.mutate();
  }, [author, pickFile, picked, title, uploadMutation]);

  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      await Promise.allSettled([booksQuery.refetch(), setsQuery.refetch()]);
    } finally {
      refreshLock.current = false;
    }
  }, [booksQuery, setsQuery]);

  const confirmDeleteSet = useCallback((setId: string, setTitle: string, cardCount: number) => {
    Alert.alert(
      "Delete these flashcards?",
      `Deleting "${setTitle}" and all ${cardCount} flashcards removes them from your account, but it will not restore the generation allowance used to create them.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Flashcards",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingSetId(setId);
              try {
                await deleteFlashcardSet(setId);
                await queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
              } catch (e) {
                Alert.alert("Could not delete set", getApiErrorMessage(e, "Please try again."));
              } finally {
                if (isMountedRef.current) setDeletingSetId(null);
              }
            })();
          },
        },
      ],
    );
  }, [queryClient]);

  const handleOpenTagEditor = useCallback((set: FlashcardSetOut) => {
    void hapticImpact("light");
    editingSetRef.current = set;
    setEditingSet(set);
  }, []);

  const handleSaveTags = useCallback(async (newTags: string[]) => {
    if (!editingSetRef.current || saveInFlightRef.current) return;

    const currentUserId = user?.id;
    const targetSetId = editingSetRef.current.id;
    saveAttemptIdRef.current += 1;
    const currentAttemptId = saveAttemptIdRef.current;

    if (!currentUserId || bootstrapStatus !== "authenticated") {
      Alert.alert("Sign in again", "Your sign-in has expired. Please continue to sign in again.");
      editingSetRef.current = null;
      setEditingSet(null);
      return;
    }

    saveInFlightRef.current = true;
    setSavingTags(true);

    try {
      const updatedSet = await updateFlashcardSetTags(targetSetId, newTags);

      if (!isMountedRef.current || currentAttemptId !== saveAttemptIdRef.current) {
        return;
      }

      const validTags =
        Array.isArray(updatedSet?.tags) &&
        updatedSet.tags.every((t) => typeof t === "string");

      if (!updatedSet || typeof updatedSet !== "object" || updatedSet.id !== targetSetId || !validTags) {
        Alert.alert("Tags not saved", "MindFlip couldn't save those tags. Please try again.");
        return;
      }

      const latestUser = useAuthStore.getState().user;
      const latestAuth = useAuthStore.getState().bootstrapStatus;

      if (
        !latestUser ||
        latestUser.id !== currentUserId ||
        latestAuth !== "authenticated" ||
        editingSetRef.current?.id !== targetSetId
      ) {
        editingSetRef.current = null;
        setEditingSet(null);
        return;
      }

      queryClient.setQueryData<FlashcardSetOut[]>(["flashcard-sets"], (old) => {
        if (!old) return old;
        return old.map((s) => (s.id === targetSetId ? { ...s, tags: updatedSet.tags } : s));
      });

      void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      void queryClient.invalidateQueries({ queryKey: ["study-session", targetSetId] });

      editingSetRef.current = null;
      setEditingSet(null);
    } catch (e: unknown) {
      if (!isMountedRef.current || currentAttemptId !== saveAttemptIdRef.current) {
        return;
      }
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        editingSetRef.current = null;
        setEditingSet(null);
        return; // Handled centrally by API client
      }
      if (status === 404) {
        Alert.alert("Set Unavailable", "This flashcard set is no longer available.");
        editingSetRef.current = null;
        setEditingSet(null);
        void queryClient.invalidateQueries({ queryKey: ["flashcard-sets"] });
      } else {
        Alert.alert("Could Not Save Tags", getApiErrorMessage(e, "Please try again."));
      }
    } finally {
      if (currentAttemptId === saveAttemptIdRef.current) {
        saveInFlightRef.current = false;
        if (isMountedRef.current) {
          setSavingTags(false);
        }
      }
    }
  }, [bootstrapStatus, queryClient, user?.id]);

  const openSetMenu = useCallback((set: FlashcardSetOut) => {
    void hapticImpact("light");
    setMenuSet(set);
  }, []);

  const closeSetMenu = useCallback(() => setMenuSet(null), []);

  const menuActions = useMemo<SetActionSheetAction[]>(() => {
    if (!menuSet) return [];
    const actions: SetActionSheetAction[] = [
      { key: "edit-tags", label: "Edit tags", icon: "pricetags-outline", onPress: () => handleOpenTagEditor(menuSet) },
    ];
    if (menuSet.card_count >= 4) {
      actions.push({
        key: "play-games",
        label: "Play games",
        icon: "game-controller-outline",
        onPress: () => router.push(`/games/${menuSet.id}`),
      });
    }
    actions.push({
      key: "delete",
      label: "Delete",
      icon: "trash-outline",
      destructive: true,
      onPress: () => confirmDeleteSet(menuSet.id, menuSet.title, menuSet.card_count),
    });
    return actions;
  }, [confirmDeleteSet, handleOpenTagEditor, menuSet]);

  const initialLoading = (booksQuery.isLoading && !booksQuery.data) || (setsQuery.isLoading && !setsQuery.data);
  const hardError = booksQuery.isError && setsQuery.isError && !booksQuery.data && !setsQuery.data;
  const isEmpty = books.length === 0 && sets.length === 0;

  if (initialLoading) return <Screen><LibrarySkeleton /></Screen>;

  if (hardError) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={42} color={colors.textMuted} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Library unavailable</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>Check your connection and try again.</Text>
          <AppButton label="Try again" onPress={() => void refresh()} style={styles.primaryButtonInline} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen keyboard={uploadOpen}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.titleText, { color: colors.text }]}>Library</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {totalBooks} book{totalBooks === 1 ? "" : "s"} · {sets.length} set{sets.length === 1 ? "" : "s"}
            </Text>
          </View>
          <IconButton
            icon="add"
            variant="filled"
            accessibilityLabel="Create study material"
            onPress={() => setUploadOpen(true)}
          />
        </View>

        <View style={[styles.search, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search books and sets"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            accessibilityLabel="Search books and flashcard sets"
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
          accessibilityLabel="Filter library"
          style={styles.segmented}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.kind === "heading" ? `heading:${item.id}` : `${item.kind}:${item.value.id}`}
        refreshControl={<RefreshControl refreshing={booksQuery.isRefetching || setsQuery.isRefetching} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        onEndReached={() => {
          if (!normalizedQuery && filter !== "sets" && booksQuery.hasNextPage && !booksQuery.isFetchingNextPage) void booksQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        ListHeaderComponent={(booksQuery.isError || setsQuery.isError) && (books.length || sets.length) ? (
          <Text style={[styles.notice, { color: colors.warning }]}>Some library items couldn't be refreshed.</Text>
        ) : null}
        ListFooterComponent={filter !== "sets" && booksQuery.hasNextPage ? (
          normalizedQuery ? (
            <Pressable style={[styles.searchMore, { borderColor: colors.borderStrong }]} disabled={booksQuery.isFetchingNextPage} onPress={() => void booksQuery.fetchNextPage()}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>{booksQuery.isFetchingNextPage ? "Searching more books…" : "Search more books"}</Text>
            </Pressable>
          ) : booksQuery.isFetchingNextPage ? (
            <Text style={[styles.loadingMore, { color: colors.textMuted }]}>Loading more books…</Text>
          ) : null
        ) : null}
        ListEmptyComponent={isEmpty && !normalizedQuery ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="library-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.text }]}>Build your first study set</Text>
            <Text style={[styles.stateBody, { color: colors.textSecondary }]}>Upload a PDF, then create flashcards from the chapters you want to learn.</Text>
            <AppButton label="Create study material" onPress={() => setUploadOpen(true)} style={styles.primaryButtonInline} />
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.stateTitle, { color: colors.text }]}>
              {filter !== "sets" && booksQuery.hasNextPage ? `No matches yet for “${query.trim()}”` : `No results for “${query.trim()}”`}
            </Text>
            <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
              {filter !== "sets" && booksQuery.hasNextPage ? "Search more books or try a different phrase." : "Try another search or choose a different filter."}
            </Text>
            {filter !== "sets" && booksQuery.hasNextPage ? (
              <AppButton
                label={booksQuery.isFetchingNextPage ? "Searching…" : "Search more books"}
                variant="secondary"
                disabled={booksQuery.isFetchingNextPage}
                onPress={() => void booksQuery.fetchNextPage()}
                style={styles.primaryButtonInline}
              />
            ) : null}
            <Pressable style={[styles.clearButton, { borderColor: colors.borderStrong }]} onPress={() => { setQuery(""); setFilter("all"); }}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Clear search and filters</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === "heading") {
            return <Text accessibilityRole="header" style={[styles.groupHeading, { color: colors.textSecondary }]}>{item.label}</Text>;
          }
          if (item.kind === "book") {
            return <BookRow book={item.value} />;
          }
          return (
            <SetRow
              set={item.value}
              onMenu={openSetMenu}
              menuDisabled={deletingSetId === item.value.id}
            />
          );
        }}
      />

      <Modal visible={uploadOpen} animationType="slide" transparent onRequestClose={() => !uploadMutation.isPending && closeCreation()}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
            <View style={[styles.grabHandle, { backgroundColor: colors.borderStrong }]} />

            <Text style={[styles.sheetTitle, { color: colors.text }]}>Create study material</Text>
            <Text style={[styles.sheetBody, { color: colors.textSecondary }]}>Upload a PDF to add a book to your library.</Text>

            <Pressable
              onPress={() => void pickFile()}
              disabled={uploadMutation.isPending}
              style={({ pressed }) => [
                styles.dropZone,
                {
                  borderColor: picked ? colors.primary : colors.borderStrong,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={picked ? `Selected file: ${picked.name}` : "Choose a PDF file"}
            >
              <View style={[styles.dropZoneIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={picked ? "document-text" : "cloud-upload-outline"} size={24} color={colors.primary} />
              </View>
              <Text style={[styles.dropZoneTitle, { color: colors.text }]} numberOfLines={1}>
                {picked ? picked.name : "Choose a PDF"}
              </Text>
              <Text style={[styles.dropZoneMeta, { color: colors.textMuted }]}>
                {picked
                  ? `${formatFileSize(picked.size)}${estimatePageCount(picked.size) ? ` · about ${estimatePageCount(picked.size)} pages` : ""}`
                  : "Tap to browse your files"}
              </Text>
            </Pressable>
            <Text style={[styles.uploadDisclaimer, { color: colors.textMuted }]}>
              By uploading, you confirm you have the right to use this material for personal study. Only upload
              content you own or are permitted to use.
            </Text>
            {detectHint ? <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>{detectHint}</Text> : null}

            <View style={[styles.fieldGroup, { backgroundColor: colors.surfaceMuted }]}>
              <AppTextInput
                label="Title"
                value={title}
                onChangeText={setTitle}
                placeholder="Book title"
              />
              <AppTextInput
                label="Author"
                value={author}
                onChangeText={setAuthor}
                placeholder="Author name"
                containerStyle={styles.lastField}
              />
            </View>

            {uploadPhaseLabel ? <Text style={[styles.status, { color: colors.primary }]}>{uploadPhaseLabel}</Text> : null}
            {uploadMutation.isError && (uploadMutation.error as { response?: { status?: number } })?.response?.status !== 402 ? (
              <Text style={[styles.status, { color: colors.danger }]}>We couldn't upload this document. Try again.</Text>
            ) : null}

            <View style={styles.actions}>
              <AppButton
                label="Cancel"
                variant="ghost"
                disabled={uploadMutation.isPending}
                onPress={closeCreation}
              />
              <AppButton
                label={uploadMutation.isPending ? uploadPhaseLabel ?? "Uploading…" : picked ? "Upload document" : "Choose PDF"}
                loading={uploadMutation.isPending}
                disabled={!!picked && (!title.trim() || !author.trim())}
                onPress={() => void upload()}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {editingSet ? (
        <TagEditModal
          visible={!!editingSet}
          setId={editingSet.id}
          setTitle={editingSet.title}
          initialTags={editingSet.tags || []}
          saving={savingTags}
          onSave={handleSaveTags}
          onClose={() => {
            if (!savingTags) setEditingSet(null);
          }}
        />
      ) : null}

      <SetActionSheet
        visible={!!menuSet}
        title={menuSet?.title ?? ""}
        actions={menuActions}
        onClose={closeSetMenu}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.md, gap: TOKENS.spacing.md },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  titleText: { ...TOKENS.typography.screenTitle },
  subtitle: { ...TOKENS.typography.secondaryBody, marginTop: 2 },
  search: { minHeight: 48, borderRadius: TOKENS.radii.md, borderWidth: 1, paddingHorizontal: TOKENS.spacing.md, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  searchInput: { ...TOKENS.typography.body, flex: 1, paddingVertical: TOKENS.spacing.sm },
  segmented: {},
  filterLabel: { ...TOKENS.typography.label },
  list: { paddingHorizontal: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing.xxxl, gap: TOKENS.spacing.sm },
  emptyList: { flexGrow: 1 },
  row: { minHeight: 104, borderRadius: TOKENS.radii.lg, borderWidth: 1, padding: TOKENS.spacing.md, flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  rowBody: { flex: 1 },
  rowTitle: { ...TOKENS.typography.bodyEmphasis },
  rowMeta: { ...TOKENS.typography.caption, marginTop: 4 },
  bookCover: { width: BOOK_COVER_WIDTH, height: BOOK_COVER_HEIGHT, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bookSpine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6 },
  bookCoverGlyph: { fontSize: 26, fontWeight: "800" },
  setSwatch: { width: SET_SWATCH_SIZE, height: SET_SWATCH_SIZE, borderRadius: TOKENS.radii.md, alignItems: "center", justifyContent: "center" },
  groupHeading: { ...TOKENS.typography.label, marginTop: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.xs },
  notice: { ...TOKENS.typography.caption, marginBottom: TOKENS.spacing.sm },
  loadingMore: { ...TOKENS.typography.caption, textAlign: "center", padding: TOKENS.spacing.lg },
  empty: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.lg },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  stateTitle: { ...TOKENS.typography.sectionTitle, textAlign: "center", marginTop: TOKENS.spacing.md },
  stateBody: { ...TOKENS.typography.body, textAlign: "center", marginTop: TOKENS.spacing.sm, maxWidth: 340 },
  primaryButtonInline: { marginTop: TOKENS.spacing.lg, minWidth: 200 },
  clearButton: { minHeight: 44, borderRadius: TOKENS.radii.md, borderWidth: 1, paddingHorizontal: TOKENS.spacing.lg, alignItems: "center", justifyContent: "center", marginTop: TOKENS.spacing.lg },
  searchMore: { minHeight: 48, borderRadius: TOKENS.radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center", marginVertical: TOKENS.spacing.lg },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: TOKENS.radii.xl, borderTopRightRadius: TOKENS.radii.xl, padding: TOKENS.spacing.xl, paddingBottom: TOKENS.spacing.xxxl },
  grabHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: TOKENS.spacing.lg },
  sheetTitle: { ...TOKENS.typography.sectionTitle },
  sheetBody: { ...TOKENS.typography.secondaryBody, marginTop: 4, marginBottom: TOKENS.spacing.md },
  dropZone: { minHeight: 132, borderRadius: TOKENS.radii.lg, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", paddingHorizontal: TOKENS.spacing.lg, paddingVertical: TOKENS.spacing.lg },
  dropZoneIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: TOKENS.spacing.sm },
  dropZoneTitle: { ...TOKENS.typography.bodyEmphasis, textAlign: "center" },
  dropZoneMeta: { ...TOKENS.typography.caption, marginTop: 2, textAlign: "center" },
  fileMeta: { ...TOKENS.typography.caption, marginTop: TOKENS.spacing.sm },
  uploadDisclaimer: { ...TOKENS.typography.caption, marginTop: TOKENS.spacing.sm },
  fieldGroup: { borderRadius: TOKENS.radii.lg, padding: TOKENS.spacing.md, marginTop: TOKENS.spacing.lg },
  lastField: { marginBottom: 0 },
  status: { ...TOKENS.typography.label, marginTop: TOKENS.spacing.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: TOKENS.spacing.md, marginTop: TOKENS.spacing.lg },
  confirmButton: { minWidth: 168 },
});
