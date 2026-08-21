import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../components/Screen";
import { SelectField } from "../components/SelectField";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import { hapticImpact } from "../lib/haptics";

type Message = { id: string; sender_type: "user" | "admin"; body: string; created_at: string };
type Conversation = { id: string | null; status: "open" | "resolved"; messages: Message[]; next_cursor: string | null };
const CATEGORIES: Record<string, string> = { "Bug Report": "bug_report", "Feature Request": "feature_request", Account: "account", Billing: "billing", General: "general", Other: "other" };
const stamp = (value: string) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const messageId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 3) | 8).toString(16); });

export default function FeedbackScreen() {
  const { colors } = useTheme(); const header = useScreenHeader("Support"); const queryClient = useQueryClient();
  const [text, setText] = useState(""); const [category, setCategory] = useState(""); const [failed, setFailed] = useState<{ message: string; category?: string | null; client_message_id: string } | null>(null);
  const [focused, setFocused] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const chat = useInfiniteQuery({ queryKey: ["support-conversation"], queryFn: async ({ pageParam }: { pageParam: string | null }) => (await api.get<Conversation>("/feedback/conversation", { params: { before: pageParam ?? undefined } })).data, initialPageParam: null as string | null, getNextPageParam: (page) => page.next_cursor ?? undefined, refetchInterval: focused ? 15000 : false });
  const messages = (chat.data?.pages ?? []).slice().reverse().flatMap((page) => page.messages);
  useFocusEffect(useCallback(() => { setFocused(true); void chat.refetch(); return () => setFocused(false); }, [chat.refetch]));
  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [messages.length]);
  const send = useMutation({ mutationFn: (body: { message: string; category?: string | null; client_message_id: string }) => api.post("/feedback/messages", body),
    onSuccess: () => { setText(""); setCategory(""); setFailed(null); void queryClient.invalidateQueries({ queryKey: ["support-conversation"] }); },
    onError: (error: unknown, body) => { setFailed(body); Alert.alert("Message not sent", getApiErrorMessage(error, "Check your connection and retry.")); } });
  const current = chat.data?.pages[0]; const categoryVisible = !current?.id || current.status === "resolved";
  const submit = (retry = failed) => { const message = retry?.message ?? text.trim(); if (!message || send.isPending || (!retry && !current?.id && !category)) return; void hapticImpact("light"); send.mutate(retry ?? { message, category: CATEGORIES[category] ?? null, client_message_id: messageId() }); };

  return <Screen keyboard>{header}<KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={[styles.supportHeader, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.supportTitle, { color: colors.text }]}>Bilkeys Support</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Usually responds as soon as possible</Text></View>
    <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" accessibilityLiveRegion="polite">
      {chat.isLoading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading support messages" />}
      {chat.isError && <View style={styles.center}><Text style={[styles.supportTitle, { color: colors.text }]}>Couldn’t load messages</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading messages" style={[styles.retry, { borderColor: colors.border }]} onPress={() => void chat.refetch()}><Text style={{ color: colors.primary }}>Try again</Text></Pressable></View>}
      {!chat.isLoading && !chat.isError && !messages.length && <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>How can we help?</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>Send Bilkeys feedback, report a problem, or ask us a question.{"\n"}No previous messages.</Text></View>}
      {chat.hasNextPage && <Pressable accessibilityRole="button" accessibilityLabel="Load earlier support messages" style={[styles.retry, { borderColor: colors.border, alignSelf: "center" }]} disabled={chat.isFetchingNextPage} onPress={() => void chat.fetchNextPage()}><Text style={{ color: colors.primary }}>{chat.isFetchingNextPage ? "Loading…" : "Load earlier messages"}</Text></Pressable>}
      {messages.map((item) => { const own = item.sender_type === "user"; return <View key={item.id} style={[styles.row, own ? styles.rowOwn : styles.rowSupport]}><Text style={[styles.sender, { color: colors.muted }]}>{own ? "You" : "Bilkeys Support"}</Text><View style={[styles.bubble, { backgroundColor: own ? colors.primary : colors.surface, borderColor: colors.border }]}><Text style={[styles.body, { color: own ? colors.onPrimary : colors.text }]}>{item.body}</Text></View><Text style={[styles.time, { color: colors.muted }]}>{stamp(item.created_at)}</Text></View>; })}
    </ScrollView>
    {failed && <View style={[styles.failed, { borderColor: colors.border }]}><Text style={{ color: colors.danger }}>Failed to send</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry sending message" onPress={() => submit(failed)}><Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text></Pressable></View>}
    <View style={[styles.composerWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>{categoryVisible && <SelectField label={`What is this about?${!current?.id ? " *" : ""}`} value={category} options={Object.keys(CATEGORIES)} onChange={setCategory} placeholder="Choose a category" />}<View style={styles.composer}><TextInput accessibilityLabel="Message Bilkeys Support" style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} placeholder="Write a message…" placeholderTextColor={colors.muted} value={text} onChangeText={setText} multiline maxLength={5000} />
      <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!text.trim() || send.isPending || (!current?.id && !category)} onPress={() => submit(null)} style={[styles.send, { backgroundColor: colors.primary }, (!text.trim() || send.isPending || (!current?.id && !category)) && styles.disabled]}>{send.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.sendText, { color: colors.onPrimary }]}>Send</Text>}</Pressable></View></View>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, supportHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 }, supportTitle: { fontSize: 17, fontWeight: "700" }, subtitle: { fontSize: 13, marginTop: 2 }, messages: { flexGrow: 1, padding: 16, gap: 16 }, center: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center" }, retry: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, marginTop: 12 }, empty: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", padding: 24 }, emptyTitle: { fontSize: 22, fontWeight: "700" }, emptyBody: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 }, row: { maxWidth: "84%" }, rowOwn: { alignSelf: "flex-end", alignItems: "flex-end" }, rowSupport: { alignSelf: "flex-start", alignItems: "flex-start" }, sender: { fontSize: 12, fontWeight: "600", marginBottom: 4 }, bubble: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }, body: { fontSize: 16, lineHeight: 22 }, time: { fontSize: 11, marginTop: 4 }, composerWrap: { padding: 10, borderTopWidth: 1, gap: 10 }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 }, input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }, send: { minWidth: 64, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, sendText: { fontWeight: "700" }, disabled: { opacity: 0.55 }, failed: { minHeight: 44, paddingHorizontal: 16, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
