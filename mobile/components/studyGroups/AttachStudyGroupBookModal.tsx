import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { flattenPages, normalizePage } from "../../lib/pagination";
import {
  parseAttachmentResponse,
  UUID_PATTERN,
  type AttachmentResponse,
} from "../../lib/studyGroupMaterials";
import { useAuthStore } from "../../store/authStore";
import type { BookOut, Paginated, StudyGroupMaterialInput } from "../../types/api";

const BOOK_PAGE_SIZE = 100;

type Props = {
  visible: boolean;
  groupId: string;
  authorized: boolean;
  attachedBookIds: Set<string>;
  onClose: () => void;
  onAccepted: (result: AttachmentResponse, refreshFailed: boolean) => void;
};

function isBookChoice(value: unknown): value is BookOut {
  if (!value || typeof value !== "object") return false;
  const book = value as Record<string, unknown>;
  return typeof book.id === "string"
    && UUID_PATTERN.test(book.id)
    && typeof book.title === "string"
    && book.title.trim().length > 0
    && typeof book.author === "string";
}

export function AttachStudyGroupBookModal({
  visible,
  groupId,
  authorized,
  attachedBookIds,
  onClose,
  onAccepted,
}: Props) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const submittingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const currentGroupIdRef = useRef(groupId);
  currentGroupIdRef.current = groupId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submittingRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSelectedBookId(null);
    setAttachmentError(null);
    submittingRef.current = null;
  }, [authorized, groupId, userId]);

  const booksQuery = useInfiniteQuery({
    queryKey: ["books", "study-group-material-picker", userId],
    enabled: visible
      && authorized
      && UUID_PATTERN.test(groupId)
      && !!userId
      && bootstrapStatus === "authenticated",
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<Paginated<BookOut> | BookOut[]>("/books/", {
        params: { page: pageParam, size: BOOK_PAGE_SIZE },
      });
      return normalizePage(data, pageParam, BOOK_PAGE_SIZE, isBookChoice);
    },
    getNextPageParam: (page) => (page.has_more ? page.page + 1 : undefined),
  });
  const books = [...new Map(flattenPages(booksQuery.data?.pages, isBookChoice).map((book) => [book.id, book])).values()];

  const attachMutation = useMutation({
    mutationFn: async ({
      bookId,
      expectedGroupId,
      expectedUserId,
    }: {
      bookId: string;
      expectedGroupId: string;
      expectedUserId: string;
    }) => {
      const auth = useAuthStore.getState();
      if (!authorized
        || auth.bootstrapStatus !== "authenticated"
        || auth.user?.id !== expectedUserId
        || currentGroupIdRef.current !== expectedGroupId
        || !UUID_PATTERN.test(bookId)
        || attachedBookIds.has(bookId)) {
        throw new Error("The book attachment is no longer authorized.");
      }
      const payload: StudyGroupMaterialInput = { book_id: bookId };
      const { data } = await api.post<unknown>(`/study-groups/${expectedGroupId}/materials`, payload);
      return parseAttachmentResponse(data, bookId);
    },
    onSuccess: async (result, variables) => {
      submittingRef.current = null;
      if (!mountedRef.current
        || useAuthStore.getState().user?.id !== variables.expectedUserId
        || currentGroupIdRef.current !== variables.expectedGroupId) return;

      let refreshFailed = false;
      await queryClient.invalidateQueries({
        queryKey: ["study-group", variables.expectedGroupId],
        exact: true,
      }, { throwOnError: true }).catch(() => {
        refreshFailed = true;
      });
      if (!mountedRef.current
        || useAuthStore.getState().user?.id !== variables.expectedUserId
        || currentGroupIdRef.current !== variables.expectedGroupId) return;
      setSelectedBookId(null);
      setAttachmentError(null);
      onAccepted(result, refreshFailed);
    },
    onError: (error: unknown, variables) => {
      submittingRef.current = null;
      if (!mountedRef.current
        || useAuthStore.getState().user?.id !== variables.expectedUserId
        || currentGroupIdRef.current !== variables.expectedGroupId) return;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 402) return;
      setAttachmentError(getApiErrorMessage(error, "The book could not be attached."));
    },
  });

  const submit = () => {
    if (!selectedBookId || submittingRef.current || attachMutation.isPending) return;
    if (!authorized
      || !userId
      || bootstrapStatus !== "authenticated"
      || !UUID_PATTERN.test(groupId)
      || !UUID_PATTERN.test(selectedBookId)
      || attachedBookIds.has(selectedBookId)) {
      setAttachmentError("The selected book cannot be attached to this group.");
      return;
    }
    submittingRef.current = selectedBookId;
    setAttachmentError(null);
    attachMutation.mutate({ bookId: selectedBookId, expectedGroupId: groupId, expectedUserId: userId });
  };

  const requestClose = () => {
    if (attachMutation.isPending || submittingRef.current) return;
    setSelectedBookId(null);
    setAttachmentError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible && authorized}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal={!attachMutation.isPending}
      onRequestClose={requestClose}
    >
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Attach a book</Text>
            <Text style={[styles.help, { color: colors.muted }]}>Choose an existing book from your library.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close book picker"
            disabled={attachMutation.isPending}
            onPress={requestClose}
            style={styles.headerAction}
          >
            <Text style={{ color: colors.primary, fontWeight: "700", opacity: attachMutation.isPending ? 0.5 : 1 }}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {booksQuery.isPending ? <Text style={{ color: colors.muted }}>Loading your books…</Text> : null}
          {booksQuery.isError ? (
            <View style={styles.statusBlock}>
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>Could not load your library.</Text>
              <Pressable accessibilityRole="button" onPress={() => void booksQuery.refetch()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {!booksQuery.isPending && !booksQuery.isError && books.length === 0 ? (
            <Text style={{ color: colors.muted }}>Your library has no books available to attach.</Text>
          ) : null}

          {books.map((book) => {
            const attached = attachedBookIds.has(book.id);
            const selected = selectedBookId === book.id;
            return (
              <Pressable
                key={book.id}
                accessibilityRole="button"
                accessibilityLabel={`${book.title}${attached ? ", already attached" : ""}`}
                accessibilityState={{ selected, disabled: attached || attachMutation.isPending }}
                disabled={attached || attachMutation.isPending}
                onPress={() => {
                  setSelectedBookId(book.id);
                  setAttachmentError(null);
                }}
                style={[
                  styles.book,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface },
                  attached && styles.disabled,
                ]}
              >
                <View style={styles.bookCopy}>
                  <Text numberOfLines={2} style={{ color: colors.text, fontWeight: "700" }}>{book.title}</Text>
                  {book.author ? <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{book.author}</Text> : null}
                </View>
                <Text style={{ color: attached || selected ? colors.primary : colors.muted, fontWeight: "700" }}>
                  {attached ? "Attached" : selected ? "Selected" : "Select"}
                </Text>
              </Pressable>
            );
          })}

          {booksQuery.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={booksQuery.isFetchingNextPage || attachMutation.isPending}
              onPress={() => void booksQuery.fetchNextPage()}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                {booksQuery.isFetchingNextPage ? "Loading…" : "Load more books"}
              </Text>
            </Pressable>
          ) : null}

          {attachmentError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{attachmentError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach selected book"
            disabled={!selectedBookId || attachMutation.isPending || (selectedBookId ? attachedBookIds.has(selectedBookId) : false)}
            onPress={submit}
            style={[styles.submit, { backgroundColor: colors.primary, opacity: !selectedBookId || attachMutation.isPending ? 0.5 : 1 }]}
          >
            <Text style={styles.submitText}>{attachMutation.isPending ? "Attaching…" : "Attach book"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 70, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  headerAction: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  help: { fontSize: 13, marginTop: 2 },
  content: { padding: 18, paddingBottom: 44, gap: 10 },
  statusBlock: { gap: 8 },
  book: { minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  bookCopy: { flex: 1 },
  disabled: { opacity: 0.6 },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  submit: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
