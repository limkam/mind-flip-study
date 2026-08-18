import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { QuizGame } from "../../components/games/QuizGame";
import { PageHeader } from "../../components/PageHeader";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { fetchEntitlementsSnapshot } from "../../lib/billing";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact, hapticSuccess } from "../../lib/haptics";
import { emitUpgradeLimit } from "../../lib/upgradeLimitEvents";
import { useAuthStore } from "../../store/authStore";
import type { ChallengeQuestionOut, ChallengeSessionOut, FlashcardOut, FlashcardSetOut, QuizChallengeOut } from "../../types/api";
import type { GameRoundResult } from "../../components/games/types";

type SendQuizState = {
  opponentEmail: string;
  set: FlashcardSetOut;
  cards: FlashcardOut[];
};

type ActiveChallengeState = {
  challenge: QuizChallengeOut;
  questions: ChallengeQuestionOut[];
};

export default function ChallengesTab() {
  const router = useRouter();

  return (
    <>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" } }} />
      <ChallengesContent
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)");
        }}
      />
    </>
  );
}

function ChallengesContent({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [sendOpen, setSendOpen] = useState(false);
  const [opponentEmail, setOpponentEmail] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [sendQuiz, setSendQuiz] = useState<SendQuizState | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallengeState | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [completionNotice, setCompletionNotice] = useState(false);

  useEffect(() => {
    setCompletionNotice(false);
  }, [user?.id]);

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await api.get<QuizChallengeOut[]>("/quiz-challenges/");
      return (data ?? []).filter((c) => Boolean(c?.id));
    },
  });

  const { data: sets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
  });

  const { data: entitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });
  const isFreeSamplePlan = entitlements?.features.challenges !== true;

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

  const startSendQuiz = async () => {
    if (!selectedSetId || !opponentEmail.trim()) return;
    const set = sets.find((s) => s.id === selectedSetId);
    if (!set) return;
    setLoadingQuiz(true);
    try {
      const { data } = await api.get<FlashcardSetOut & { cards?: FlashcardOut[] }>(`/flashcard-sets/${selectedSetId}`);
      if (!data.cards?.length) {
        Alert.alert("No cards", "This set has no flashcards to quiz on.");
        return;
      }
      setSendOpen(false);
      setSendQuiz({
        opponentEmail: opponentEmail.trim(),
        set,
        cards: data.cards,
      });
    } catch {
      Alert.alert("Could not load quiz", "Please try again.");
    } finally {
      setLoadingQuiz(false);
    }
  };

  const sendMutation = useMutation({
    mutationFn: async (result: GameRoundResult) => {
      if (!sendQuiz) return;
      const pct = result.percentage ?? Math.round((result.playerScore / result.totalRounds) * 100);
      const time = result.timeTakenSeconds ?? 0;
      await api.post("/quiz-challenges/", {
        flashcard_set_id: sendQuiz.set.id,
        opponent_email: sendQuiz.opponentEmail,
        set_title: sendQuiz.set.title,
        book_title: sendQuiz.set.book_title,
        challenger_score: result.playerScore,
        challenger_percentage: pct,
        challenger_time_seconds: time,
      });
    },
    onSuccess: async () => {
      setSendQuiz(null);
      setOpponentEmail("");
      setSelectedSetId("");
      await queryClient.invalidateQueries({ queryKey: ["quiz-challenges"] });
    },
    onError: () => Alert.alert("Could not send challenge", "Please try again."),
  });

  const acceptChallenge = async (challenge: QuizChallengeOut) => {
    setLoadingQuiz(true);
    try {
      const { data } = await api.get<ChallengeSessionOut>(
        `/quiz-challenges/${challenge.id}/session`,
      );
      if (!data.questions?.length) {
        Alert.alert("No questions", "Could not load this challenge.");
        return;
      }
      setActiveChallenge({ challenge, questions: data.questions });
    } catch (err: any) {
      if (err?.isPlanLimitError) return;
      if (err?.response?.status === 410) {
        Alert.alert("Challenge expired", "This challenge is no longer available to play.");
        await queryClient.invalidateQueries({ queryKey: ["quiz-challenges"] });
        return;
      }
      Alert.alert("Could not start challenge", "Please try again.");
    } finally {
      setLoadingQuiz(false);
    }
  };

  const completeMutation = useMutation({
    mutationFn: async ({ challenge, result }: { challenge: QuizChallengeOut; result: GameRoundResult }) => {
      const pct = result.percentage ?? Math.round((result.playerScore / result.totalRounds) * 100);
      const time = result.timeTakenSeconds ?? 0;
      await api.patch(`/quiz-challenges/${challenge.id}`, {
        opponent_score: result.playerScore,
        opponent_percentage: pct,
        opponent_time_seconds: time,
        status: "completed",
      });
    },
    onSuccess: async (_data, { challenge }) => {
      setActiveChallenge(null);
      setCompletionNotice(true);
      void hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ["quiz-challenges"] });
      if (isFreeSamplePlan) {
        emitUpgradeLimit({
          reason: `Loved "${challenge.set_title ?? "that deck"}"? Create your own deck and send challenges — upgrade to Quick 7 or higher.`,
        });
      }
    },
    onError: () => Alert.alert("Could not submit score", "Please try again."),
  });

  const sections = [
    { title: "Pending (for you)", data: pending, incoming: true },
    { title: "Sent", data: sent, incoming: false },
    { title: "Completed", data: completed, incoming: false },
  ].filter((s) => s.data.length > 0);

  useEffect(() => {
    if (!sendQuiz && !activeChallenge) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSendQuiz(null);
      setActiveChallenge(null);
      return true;
    });
    return () => subscription.remove();
  }, [activeChallenge, sendQuiz]);

  if (sendQuiz) {
    return (
      <Screen>
        <View style={styles.quizHeader}>
          <Text style={[styles.quizTitle, { color: colors.text }]}>Take the quiz first</Text>
          <Text style={[styles.quizSub, { color: colors.muted }]}>
            Then challenge {sendQuiz.opponentEmail}
          </Text>
          <Pressable onPress={() => setSendQuiz(null)}>
            <Text style={{ color: colors.primary, fontWeight: "600", marginTop: 8 }}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <QuizGame
            cards={sendQuiz.cards}
            onComplete={(result) => sendMutation.mutate(result)}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (activeChallenge) {
    const ch = activeChallenge.challenge;
    return (
      <Screen>
        <View style={styles.quizHeader}>
          <Text style={[styles.quizTitle, { color: colors.text }]}>Beat their score</Text>
          <Text style={[styles.quizSub, { color: colors.muted }]}>
            {ch.challenger_name || ch.challenger_email} scored {ch.challenger_percentage ?? "—"}%
          </Text>
          <Pressable onPress={() => setActiveChallenge(null)}>
            <Text style={{ color: colors.primary, fontWeight: "600", marginTop: 8 }}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <QuizGame
            questions={activeChallenge.questions}
            onComplete={(result) => completeMutation.mutate({ challenge: ch, result })}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen keyboard={sendOpen}>
      <View style={styles.headerRow}>
        <PageHeader
          title="Challenges"
          subtitle="Take a quiz, then challenge a friend to beat your score"
          showBack
          onBack={onBack}
        />
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

      {completionNotice ? (
        <View accessibilityRole="alert" style={[styles.completionNotice, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
          <Text style={[styles.completionIcon, { color: colors.primary }]}>✓</Text>
          <View style={{ flex: 1 }}><Text style={[styles.completionTitle, { color: colors.text }]}>Challenge complete</Text><Text style={[styles.completionBody, { color: colors.textSecondary }]}>Your score was submitted.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss challenge completion" hitSlop={8} onPress={() => setCompletionNotice(false)}><Text style={[styles.completionClose, { color: colors.textMuted }]}>×</Text></Pressable>
        </View>
      ) : null}

      {isLoading || loadingQuiz ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="⚔️"
          title="No challenges yet"
          message="Take a quiz on one of your sets, then challenge a friend to beat your score."
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
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  userEmail={user?.email}
                  colors={colors}
                  onAccept={section.incoming ? () => void acceptChallenge(c) : undefined}
                />
              ))}
            </View>
          )}
        />
      )}

      <Modal visible={sendOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Send challenge</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>
              You must take the quiz first. Your opponent will see your score and try to beat it.
            </Text>
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
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSendOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, loadingQuiz && { opacity: 0.6 }]}
                disabled={!opponentEmail.trim() || !selectedSetId || loadingQuiz}
                onPress={() => void startSendQuiz()}
              >
                <Text style={styles.primaryBtnText}>
                  {loadingQuiz ? "Loading…" : "Take quiz & send"}
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
  onAccept,
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
  onAccept?: () => void;
}) {
  const isIncoming = challenge.opponent_email === userEmail && challenge.status === "pending";
  const myPct =
    challenge.challenger_email === userEmail ? challenge.challenger_percentage : challenge.opponent_percentage;
  const theirPct =
    challenge.challenger_email === userEmail ? challenge.opponent_percentage : challenge.challenger_percentage;

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
          ? `From ${challenge.challenger_name || challenge.challenger_email}`
          : `To ${challenge.opponent_email}`}
      </Text>
      {isIncoming && challenge.challenger_percentage != null ? (
        <Text style={[styles.scoreLine, { color: colors.primary }]}>
          They scored {challenge.challenger_percentage}% — beat it!
        </Text>
      ) : null}
      {!isIncoming && challenge.challenger_percentage != null && challenge.status === "pending" ? (
        <Text style={[styles.scoreLine, { color: colors.muted }]}>
          Your score: {challenge.challenger_percentage}%
        </Text>
      ) : null}
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
          ? `${myPct ?? "—"}% vs ${theirPct ?? "—"}%`
          : isIncoming
            ? "Awaiting your response"
            : "Waiting for opponent"}
      </Text>
      {onAccept ? (
        <Pressable
          style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void hapticImpact("light");
            onAccept();
          }}
        >
          <Text style={styles.acceptBtnText}>Accept & play</Text>
        </Pressable>
      ) : null}
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
  quizHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  quizTitle: { fontSize: 20, fontWeight: "700" },
  quizSub: { fontSize: 14, marginTop: 4 },
  primaryBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  completionNotice: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 },
  completionIcon: { fontSize: 24, fontWeight: "800" }, completionTitle: { fontSize: 15, fontWeight: "700" }, completionBody: { fontSize: 13, marginTop: 2 }, completionClose: { fontSize: 24, paddingHorizontal: 8 },
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
  scoreLine: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  status: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  acceptBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "700" },
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
