import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type { FlashcardSetOut, QuizChallengeOut } from "../../types/api";

export default function ChallengesTab() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [sendOpen, setSendOpen] = useState(false);
  const [opponentEmail, setOpponentEmail] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("");

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await api.get<QuizChallengeOut[]>("/quiz-challenges/");
      return (data ?? []).filter((c) => Boolean(c?.id));
    },
  });

  const { data: sets = [] } = useQuery({
    queryKey: ["flashcard-sets", "list"],
    queryFn: fetchFlashcardSetsList,
    staleTime: 0,
  });

  const { pending, sent, completed } = useMemo(() => {
    const mine = challenges.filter(
      (c) => c.challenger_email === user?.email || c.opponent_email === user?.email,
    );
    return {
      pending: mine.filter((c) => c.status === "pending" && c.opponent_email === user?.email),
      sent: mine.filter((c) => c.status === "pending" && c.challenger_email === user?.email),
      completed: mine.filter((c) => c.status === "completed"),
    };
  }, [challenges, user?.email]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const set = sets.find((s) => s.id === selectedSetId);
      await api.post("/quiz-challenges/", {
        flashcard_set_id: selectedSetId,
        opponent_email: opponentEmail.trim(),
        set_title: set?.title,
        book_title: set?.book_title,
      });
    },
    onSuccess: async () => {
      setSendOpen(false);
      setOpponentEmail("");
      setSelectedSetId("");
      await queryClient.invalidateQueries({ queryKey: ["quiz-challenges"] });
    },
  });

  const sections = [
    { title: "Pending (for you)", data: pending },
    { title: "Sent", data: sent },
    { title: "Completed", data: completed },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen keyboard={sendOpen}>
      <View style={styles.headerRow}>
        <PageHeader title="Challenges" subtitle="Quiz battles with friends" />
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            setSendOpen(true);
          }}
        >
          <Text style={styles.primaryBtnText}>Send</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={[styles.center, { color: colors.muted }]}>Loading…</Text>
      ) : sections.length === 0 ? (
        <EmptyState
          icon="⚔️"
          title="No challenges yet"
          message="Challenge a friend to a quiz on one of your flashcard sets."
          actionLabel="Send challenge"
          onAction={() => setSendOpen(true)}
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          contentContainerStyle={styles.list}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              {section.data.map((c) => (
                <ChallengeCard key={c.id} challenge={c} userEmail={user?.email} colors={colors} />
              ))}
            </View>
          )}
        />
      )}

      <Modal visible={sendOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Send challenge</Text>
            <Text style={[styles.label, { color: colors.muted }]}>Opponent email</Text>
            <TextInput
              value={opponentEmail}
              onChangeText={setOpponentEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="friend@example.com"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
            <Text style={[styles.label, { color: colors.muted }]}>Flashcard set</Text>
            <View style={styles.setList}>
              {sets.map((set) => (
                <Pressable
                  key={set.id}
                  style={[
                    styles.setChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: selectedSetId === set.id ? colors.primary : colors.background,
                    },
                  ]}
                  onPress={() => setSelectedSetId(set.id)}
                >
                  <Text
                    style={{
                      color: selectedSetId === set.id ? "#fff" : colors.text,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {set.title}
                  </Text>
                </Pressable>
              ))}
            </View>
            {sendMutation.isError ? (
              <Text style={{ color: colors.danger, marginTop: 8 }}>Could not send challenge</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSendOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, sendMutation.isPending && { opacity: 0.6 }]}
                disabled={!opponentEmail.trim() || !selectedSetId || sendMutation.isPending}
                onPress={() => sendMutation.mutate()}
              >
                <Text style={styles.primaryBtnText}>
                  {sendMutation.isPending ? "Sending…" : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ChallengeCard({
  challenge,
  userEmail,
  colors,
}: {
  challenge: QuizChallengeOut;
  userEmail?: string;
  colors: {
    surface: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    success: string;
  };
}) {
  const isIncoming = challenge.opponent_email === userEmail && challenge.status === "pending";
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
        {challenge.set_title ?? "Flashcard set"}
      </Text>
      {challenge.book_title ? (
        <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
          {challenge.book_title}
        </Text>
      ) : null}
      <Text style={[styles.cardMeta, { color: colors.muted }]}>
        {isIncoming
          ? `From ${challenge.challenger_email}`
          : `To ${challenge.opponent_email}`}
      </Text>
      <Text
        style={[
          styles.status,
          {
            color:
              challenge.status === "completed"
                ? colors.success
                : isIncoming
                  ? colors.primary
                  : colors.muted,
          },
        ]}
      >
        {challenge.status === "completed"
          ? `Done · You ${challenge.challenger_email === userEmail ? challenge.challenger_score : challenge.opponent_score ?? "—"}`
          : isIncoming
            ? "Awaiting your response"
            : "Waiting for opponent"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingRight: 16,
  },
  primaryBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  center: { textAlign: "center", marginTop: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardMeta: { fontSize: 13, marginTop: 4 },
  status: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { borderRadius: 16, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    minHeight: 44,
  },
  setList: { marginTop: 8, gap: 8, maxHeight: 160 },
  setChip: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 40,
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 20,
    alignItems: "center",
  },
});
