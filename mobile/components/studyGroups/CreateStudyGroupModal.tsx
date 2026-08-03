import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { flattenPages, normalizePage } from "../../lib/pagination";
import { useAuthStore } from "../../store/authStore";
import type {
  BookOut,
  Paginated,
  StudyGroupCreateInput,
  StudyGroupOut,
  StudyGroupPrivacy,
} from "../../types/api";

const BOOK_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Props = {
  visible: boolean;
  creationAllowed: boolean;
  onClose: () => void;
  onCreated: (group: StudyGroupOut) => void;
  onCreatedWithoutDetail: () => void;
};

function isStudyGroupOut(value: unknown): value is StudyGroupOut {
  if (!value || typeof value !== "object") return false;
  const group = value as Record<string, unknown>;
  return typeof group.id === "string"
    && UUID_PATTERN.test(group.id)
    && typeof group.name === "string"
    && (group.description === null || typeof group.description === "string")
    && (group.code === null || typeof group.code === "string")
    && (group.privacy === "public" || group.privacy === "private")
    && Number.isInteger(group.weekly_card_goal)
    && typeof group.member_count === "number"
    && typeof group.cards_this_week === "number"
    && typeof group.progress_pct === "number"
    && typeof group.activity_status === "string"
    && (group.created_at === null || typeof group.created_at === "string");
}

export function CreateStudyGroupModal({ visible, creationAllowed, onClose, onCreated, onCreatedWithoutDetail }: Props) {
  const { colors } = useTheme();
  const userId = useAuthStore((state) => state.user?.id);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<StudyGroupPrivacy>("public");
  const [weeklyGoal, setWeeklyGoal] = useState("20");
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const booksQuery = useInfiniteQuery({
    queryKey: ["books", "study-group-create", userId],
    enabled: visible && creationAllowed && !!userId && bootstrapStatus === "authenticated",
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<BookOut> | BookOut[]>("/books/", {
        params: { page: pageParam, size: BOOK_PAGE_SIZE },
      });
      return normalizePage(data, pageParam, BOOK_PAGE_SIZE);
    },
    getNextPageParam: (page) => (page.has_more ? page.page + 1 : undefined),
  });
  const books = [...new Map(flattenPages(booksQuery.data?.pages).map((book) => [book.id, book])).values()];

  const reset = () => {
    setName("");
    setDescription("");
    setPrivacy("public");
    setWeeklyGoal("20");
    setSelectedBookIds([]);
    setValidationError(null);
  };

  useEffect(() => {
    submitting.current = false;
    reset();
  }, [userId]);

  const createMutation = useMutation({
    mutationFn: async ({ payload, expectedUserId }: { payload: StudyGroupCreateInput; expectedUserId: string }) => {
      if (!creationAllowed || userId !== expectedUserId || bootstrapStatus !== "authenticated") {
        throw new Error("Study group creation access could not be verified.");
      }
      const { data } = await api.post<unknown>("/study-groups/", payload);
      return isStudyGroupOut(data) ? { status: "created" as const, group: data } : { status: "created_without_detail" as const };
    },
    onSuccess: (result, variables) => {
      submitting.current = false;
      if (useAuthStore.getState().user?.id !== variables.expectedUserId) return;
      reset();
      if (result.status === "created") onCreated(result.group);
      else onCreatedWithoutDetail();
    },
    onError: (error: unknown) => {
      submitting.current = false;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401) return;
      setValidationError(getApiErrorMessage(error, "The group could not be created."));
    },
  });

  const submit = () => {
    if (submitting.current || createMutation.isPending) return;
    if (!creationAllowed || !userId || bootstrapStatus !== "authenticated") {
      setValidationError("Study group creation access could not be verified.");
      return;
    }
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const goal = Number(weeklyGoal);
    const uniqueBookIds = [...new Set(selectedBookIds)];
    let error: string | null = null;
    if (trimmedName.length < 2) error = "Group name must contain at least 2 characters.";
    else if (trimmedName.length > 128) error = "Group name must be 128 characters or fewer.";
    else if (trimmedDescription.length > 2000) error = "Description must be 2,000 characters or fewer.";
    else if (privacy !== "public" && privacy !== "private") error = "Choose public or private privacy.";
    else if (!Number.isInteger(goal) || goal < 1 || goal > 500) error = "Weekly goal must be a whole number from 1 to 500.";
    else if (uniqueBookIds.some((id) => !UUID_PATTERN.test(id))) error = "One or more selected books are invalid.";
    if (error) {
      setValidationError(error);
      return;
    }

    submitting.current = true;
    setValidationError(null);
    createMutation.mutate({
      expectedUserId: userId,
      payload: {
        name: trimmedName,
        description: trimmedDescription || null,
        privacy,
        weekly_card_goal: goal,
        book_ids: uniqueBookIds,
      },
    });
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((current) => current.includes(bookId)
      ? current.filter((id) => id !== bookId)
      : [...new Set([...current, bookId])]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Create study group</Text>
          <Pressable disabled={createMutation.isPending} onPress={onClose}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FieldLabel text="Group name" colors={colors} />
          <TextInput value={name} onChangeText={setName} maxLength={128} placeholder="e.g. Biology study crew" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <FieldLabel text="Description (optional)" colors={colors} />
          <TextInput value={description} onChangeText={setDescription} maxLength={2000} multiline placeholder="What will you study together?" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />

          <FieldLabel text="Privacy" colors={colors} />
          <View style={styles.row}>
            {(["public", "private"] as StudyGroupPrivacy[]).map((value) => (
              <Pressable key={value} onPress={() => setPrivacy(value)} style={[styles.choice, { borderColor: privacy === value ? colors.primary : colors.border, backgroundColor: privacy === value ? `${colors.primary}18` : colors.surface }]}>
                <Text style={{ color: privacy === value ? colors.primary : colors.text, fontWeight: "700", textTransform: "capitalize" }}>{value}</Text>
              </Pressable>
            ))}
          </View>

          <FieldLabel text="Weekly card goal" colors={colors} />
          <TextInput value={weeklyGoal} onChangeText={setWeeklyGoal} keyboardType="number-pad" maxLength={3} placeholder="20" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          <Text style={[styles.help, { color: colors.muted }]}>1–500 cards per member each week</Text>

          <View style={styles.bookHeading}>
            <FieldLabel text="Study books (optional)" colors={colors} />
            <Text style={[styles.help, { color: colors.muted }]}>{selectedBookIds.length} selected</Text>
          </View>
          {booksQuery.isPending ? <Text style={{ color: colors.muted }}>Loading books…</Text> : null}
          {booksQuery.isError ? (
            <Pressable onPress={() => void booksQuery.refetch()}><Text style={{ color: colors.danger }}>Could not load books. Tap to retry.</Text></Pressable>
          ) : null}
          {!booksQuery.isPending && !booksQuery.isError && books.length === 0 ? <Text style={{ color: colors.muted }}>No books in your library yet.</Text> : null}
          {books.map((book) => {
            const selected = selectedBookIds.includes(book.id);
            return (
              <Pressable key={book.id} onPress={() => toggleBook(book.id)} style={[styles.book, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.check, { color: selected ? colors.primary : colors.muted }]}>{selected ? "✓" : "○"}</Text>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: "600" }}>{book.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{book.author}</Text></View>
              </Pressable>
            );
          })}
          {booksQuery.hasNextPage ? (
            <Pressable disabled={booksQuery.isFetchingNextPage} onPress={() => void booksQuery.fetchNextPage()} style={[styles.secondaryButton, { borderColor: colors.border }]}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>{booksQuery.isFetchingNextPage ? "Loading…" : "Load more books"}</Text>
            </Pressable>
          ) : null}

          {validationError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{validationError}</Text> : null}
          <Pressable disabled={createMutation.isPending || !creationAllowed} onPress={submit} style={[styles.submit, { backgroundColor: colors.primary, opacity: createMutation.isPending || !creationAllowed ? 0.5 : 1 }]}>
            <Text style={styles.submitText}>{createMutation.isPending ? "Creating…" : "Create group"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function FieldLabel({ text, colors }: { text: string; colors: { text: string } }) {
  return <Text style={[styles.label, { color: colors.text }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 18, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 19, fontWeight: "800" },
  content: { padding: 18, paddingBottom: 44, gap: 10 },
  label: { fontSize: 14, fontWeight: "700", marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 13, fontSize: 15 },
  multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  choice: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  help: { fontSize: 12 },
  bookHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  book: { minHeight: 54, borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  check: { fontSize: 20, width: 22 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  submit: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
