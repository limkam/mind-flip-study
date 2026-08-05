import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { api } from "../../api/client";
import {
  ContextualNudge,
  EngagementCenter,
} from "../../components/EngagementCenter";
import { Screen } from "../../components/Screen";
import { WeakTopicsChips } from "../../components/WeakTopicsChips";
import { DashboardSkeleton } from "../../components/skeletons/DashboardSkeleton";
import { useTheme } from "../../hooks/useTheme";
import { fetchEntitlementsSnapshot } from "../../lib/billing";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { hapticImpact } from "../../lib/haptics";
import { useAuthStore } from "../../store/authStore";
import type {
  AnalyticsSummaryOut,
  BookOut,
  Paginated,
  QuizChallengeOut,
  QuizResultOut,
} from "../../types/api";

/** Validate analytics response has required numeric fields; returns null on malformed data. */
function parseAnalyticsSummary(raw: unknown): AnalyticsSummaryOut | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.quiz_count !== "number" ||
    typeof obj.avg_score !== "number" ||
    typeof obj.streak_days !== "number"
  ) {
    return null;
  }
  return raw as AnalyticsSummaryOut;
}

/** Validate a paginated books response envelope. Backend always returns BookListPage. */
function parseBooksPage(raw: unknown): Paginated<BookOut> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.total !== "number" ||
    typeof obj.page !== "number" ||
    !Array.isArray(obj.items)
  ) {
    return null;
  }
  // Validate each item has a canonical ID
  const validItems = (obj.items as unknown[]).filter((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.title === "string";
  }) as BookOut[];
  return {
    items: validItems,
    total: obj.total,
    page: obj.page,
    size: typeof obj.size === "number" ? obj.size : validItems.length,
    has_more: typeof obj.has_more === "boolean" ? obj.has_more : false,
  };
}

function parseQuizResultOut(raw: unknown): QuizResultOut | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.set_id !== "string" ||
    typeof obj.score !== "number" ||
    typeof obj.total_questions !== "number"
  ) {
    return null;
  }
  const score = Math.max(0, obj.score);
  const total = Math.max(1, obj.total_questions);
  const calculatedPct = Math.round((score / total) * 100);
  const pct =
    typeof obj.percentage === "number" ? Math.round(obj.percentage) : calculatedPct;

  return {
    id: obj.id,
    user_id: typeof obj.user_id === "string" ? obj.user_id : "",
    set_id: obj.set_id,
    score,
    total_questions: total,
    time_taken_seconds:
      typeof obj.time_taken_seconds === "number" ? obj.time_taken_seconds : 0,
    completed_at:
      typeof obj.completed_at === "string"
        ? obj.completed_at
        : new Date().toISOString(),
    extras: (obj.extras as Record<string, unknown>) ?? {},
    flashcard_set_id:
      typeof obj.flashcard_set_id === "string" ? obj.flashcard_set_id : null,
    percentage: pct,
    player_email:
      typeof obj.player_email === "string" ? obj.player_email : null,
    player_name: typeof obj.player_name === "string" ? obj.player_name : null,
    set_title:
      typeof obj.set_title === "string"
        ? obj.set_title
        : typeof (obj.extras as Record<string, unknown>)?.set_title === "string"
          ? ((obj.extras as Record<string, unknown>).set_title as string)
          : "Quiz",
    book_title:
      typeof obj.book_title === "string" ? obj.book_title : null,
    celebration_events: [],
  };
}

function parseQuizChallengeOut(raw: unknown): QuizChallengeOut | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.status !== "string" ||
    typeof obj.opponent_email !== "string"
  ) {
    return null;
  }
  return {
    id: obj.id,
    flashcard_set_id:
      typeof obj.flashcard_set_id === "string" ? obj.flashcard_set_id : "",
    challenger_email:
      typeof obj.challenger_email === "string" ? obj.challenger_email : "",
    opponent_email: obj.opponent_email,
    status: obj.status,
    set_title: typeof obj.set_title === "string" ? obj.set_title : null,
  };
}

export default function DashboardTab() {
  const { colors } = useTheme();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const isAuthenticated =
    bootstrapStatus === "authenticated" && Boolean(accessToken && user?.id);

  const entrance = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  // Mounted ref to prevent setRefreshing state updates on unmounted component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Entitlements
  const {
    data: entitlements,
    isLoading: entitlementsLoading,
    isError: entitlementsError,
    refetch: refetchEntitlements,
  } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated,
  });
  // Four-state: loading | enabled | disabled | error
  const challengesEnabled = entitlements?.features?.challenges === true;
  const entitlementsResolved = !entitlementsLoading && !entitlementsError;

  // 2. Analytics Summary (Essential)
  const {
    data: rawSummary,
    isLoading: summaryLoading,
    isError: summaryError,
    isSuccess: summarySuccess,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsSummaryOut>("/analytics/summary");
      const validated = parseAnalyticsSummary(data);
      if (!validated) throw new Error("Malformed analytics response");
      return validated;
    },
    enabled: isAuthenticated,
  });
  const summary = rawSummary ?? null;

  // 3. Flashcard Sets (Essential)
  const {
    data: flashcardSets = [],
    isLoading: setsLoading,
    isError: setsError,
    isSuccess: setsSuccess,
    refetch: refetchSets,
  } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: fetchFlashcardSetsList,
    enabled: isAuthenticated,
  });

  // 4. Books (Optional — backend always returns BookListPage)
  const {
    data: rawBooksData,
    isLoading: booksLoading,
    isError: booksError,
    refetch: refetchBooks,
  } = useQuery({
    queryKey: ["books", "paginated"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<BookOut>>("/books/", {
        params: { page: 1, size: 20 },
      });
      const validated = parseBooksPage(data);
      if (!validated) throw new Error("Malformed books response");
      return validated;
    },
    enabled: isAuthenticated,
  });

  // 5. Recent Quiz Results (Optional, page size 2)
  const {
    data: quizPage,
    isLoading: quizLoading,
    isError: quizError,
    refetch: refetchQuizResults,
  } = useQuery({
    queryKey: ["quiz-results", "dashboard-recent"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<QuizResultOut>>("/quiz-results/", {
        params: { page: 1, size: 2 },
      });
      return data;
    },
    enabled: isAuthenticated,
  });

  // 6. Quiz Challenges (Optional, gated by explicit entitlement)
  const {
    data: challengesData,
    isLoading: challengesLoading,
    isError: challengesError,
    refetch: refetchChallenges,
  } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await api.get<QuizChallengeOut[]>("/quiz-challenges/");
      return data;
    },
    enabled: isAuthenticated && challengesEnabled,
  });

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      stiffness: 110,
      damping: 15,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  // Derived View Model

  // Authoritative book total from paginated envelope; null when unavailable
  const bookTotal: number | null = useMemo(() => {
    if (booksLoading) return null; // still loading
    if (booksError || !rawBooksData) return null; // failed or absent
    return rawBooksData.total;
  }, [rawBooksData, booksLoading, booksError]);

  // Display value for the stat card: authoritative total or "—" when unavailable
  const bookCountDisplay: string | number = bookTotal ?? "—";

  const recentQuizResults = useMemo(() => {
    const rawItems = quizPage?.items ?? [];
    const valid: QuizResultOut[] = [];
    for (const item of rawItems) {
      const parsed = parseQuizResultOut(item);
      if (parsed) valid.push(parsed);
    }
    return valid.slice(0, 2);
  }, [quizPage]);

  const pendingChallengeCount = useMemo(() => {
    if (!challengesEnabled || !challengesData) return 0;
    const rawList = Array.isArray(challengesData) ? challengesData : [];
    let count = 0;
    for (const item of rawList) {
      const parsed = parseQuizChallengeOut(item);
      if (
        parsed &&
        parsed.status === "pending" &&
        parsed.opponent_email.toLowerCase() === (user?.email ?? "").toLowerCase()
      ) {
        count++;
      }
    }
    return count;
  }, [challengesData, challengesEnabled, user?.email]);

  const quizTotal = summary?.quiz_count ?? 0;
  // Flashcard-set endpoint returns full unpaginated list; .length is authoritative
  const setTotal = flashcardSets.length;
  const avgScore = Math.round(summary?.avg_score ?? 0);
  const streakDays = summary?.streak_days ?? 0;
  const weakTopics = summary?.weak_topics ?? [];

  // Web new-user rule: requires successful essential query loads before classifying as new
  const isNewUser =
    summarySuccess &&
    setsSuccess &&
    quizTotal === 0 &&
    flashcardSets.length === 0;

  const firstSet = flashcardSets[0];

  // Truthful challenge badge value: null when error, 0 when explicitly no pending, count when available
  const pendingBadgeValue: number | null = useMemo(() => {
    if (!challengesEnabled) return null; // entitlement off — hide
    if (challengesError) return null; // failed — hide badge
    if (challengesLoading || !challengesData) return null; // loading — hide badge
    return pendingChallengeCount;
  }, [challengesEnabled, challengesError, challengesLoading, challengesData, pendingChallengeCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      refetchSummary(),
      refetchSets(),
      refetchBooks(),
      refetchQuizResults(),
      challengesEnabled ? refetchChallenges() : Promise.resolve(),
      refetchEntitlements(),
    ]);
    if (isMountedRef.current) {
      setRefreshing(false);
    }
  }, [challengesEnabled, refetchSummary, refetchSets, refetchBooks, refetchQuizResults, refetchChallenges, refetchEntitlements]);

  // Essential query state: initial loading, hard error, or ready
  const essentialLoading = summaryLoading || setsLoading;
  const essentialError = !essentialLoading && !summary && !setsSuccess;

  if (essentialLoading) {
    return (
      <Screen>
        <DashboardSkeleton />
      </Screen>
    );
  }

  if (essentialError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.errorContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
            />
          }
        >
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Unable to load dashboard
          </Text>
          <Text style={[styles.errorSub, { color: colors.muted }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => {
              if (summaryError) void refetchSummary();
              if (setsError) void refetchSets();
            }}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading dashboard"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          }}
        >
          {/* Header Top Row */}
          <View style={styles.topRow}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>
                YOUR LEARNING SPACE
              </Text>
              <Text style={[styles.greeting, { color: colors.text }]}>
                Hey, {user?.full_name?.split(" ")[0] ?? "Learner"} 👋
              </Text>
            </View>
            <EngagementCenter />
          </View>

          {/* Pending Challenge Banner */}
          {challengesEnabled && pendingBadgeValue !== null && pendingBadgeValue > 0 && (
            <Pressable
              onPress={() => {
                void hapticImpact("light");
                router.push("/challenges");
              }}
              style={[
                styles.challengeBanner,
                {
                  backgroundColor: `${colors.primary}15`,
                  borderColor: `${colors.primary}40`,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${pendingBadgeValue} pending challenges. Tap to view.`}
            >
              <View style={styles.challengeIconWrap}>
                <Ionicons name="flash" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.challengeTitle, { color: colors.text }]}>
                  Pending Challenges
                </Text>
                <Text style={[styles.challengeSub, { color: colors.muted }]}>
                  You have {pendingBadgeValue} challenge
                  {pendingBadgeValue !== 1 ? "s" : ""} waiting for you!
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.primary}
              />
            </Pressable>
          )}

          {/* Challenge query error (when enabled but failed) */}
          {challengesEnabled && challengesError && (
            <View style={[styles.challengeBanner, { backgroundColor: `${colors.muted}10`, borderColor: `${colors.border}` }]}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
              <Text style={[styles.challengeSub, { color: colors.muted, flex: 1 }]}>
                Challenge status unavailable
              </Text>
              <Pressable
                onPress={() => void refetchChallenges()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Retry loading challenges"
              >
                <Text style={[styles.linkText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Hero Section */}
          <View style={styles.hero}>
            <View style={styles.heroOrbOne} />
            <View style={styles.heroOrbTwo} />
            <View style={styles.heroTop}>
              <View style={styles.streakPill}>
                <Ionicons name="flame" size={16} color="#fbbf24" />
                <Text style={styles.streakText}>{streakDays} day streak</Text>
              </View>
              <Ionicons name="sparkles" size={22} color="#ffffffaa" />
            </View>
            <Text style={styles.heroTitle}>
              {firstSet ? "Ready for another win?" : "Start your learning journey"}
            </Text>
            <Text style={styles.heroCaption}>
              {firstSet
                ? firstSet.title
                : "Add a book and turn it into a study experience."}
            </Text>
            <Link
              href={firstSet ? `/study/${firstSet.id}` : "/(tabs)/library"}
              asChild
            >
              <Pressable
                onPress={() => void hapticImpact("medium")}
                style={styles.heroButton}
              >
                <Ionicons
                  name={firstSet ? "play" : "add"}
                  size={17}
                  color="#5b21b6"
                />
                <Text style={styles.heroButtonText}>
                  {firstSet ? "Continue studying" : "Add your first book"}
                </Text>
              </Pressable>
            </Link>
          </View>

          <ContextualNudge />

          {/* Today at a Glance Stats */}
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Today at a glance
            </Text>
            <Link href="/analytics" asChild>
              <Pressable>
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  View analytics
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.statsGrid}>
            {[
              {
                label: "Books",
                value: bookCountDisplay,
                icon: "book-outline",
                tint: "#3b82f6",
                accessibilityHint: bookTotal === null ? "Book count unavailable" : undefined,
              },
              {
                label: "Sets",
                value: setTotal,
                icon: "albums-outline",
                tint: "#6366f1",
              },
              {
                label: "Quizzes",
                value: quizTotal,
                icon: "help-circle-outline",
                tint: "#ec4899",
              },
              {
                label: "Average",
                value: `${avgScore}%`,
                icon: "pulse-outline",
                tint: "#10b981",
              },
            ].map((s, index) => (
              <Animated.View
                key={s.label}
                style={[
                  styles.statCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    transform: [
                      {
                        scale: entrance.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9 + index * 0.01, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View
                  style={[styles.statIcon, { backgroundColor: `${s.tint}18` }]}
                >
                  <Ionicons name={s.icon as never} size={18} color={s.tint} />
                </View>
                <Text
                  style={[styles.statValue, { color: colors.text }]}
                  accessibilityHint={(s as { accessibilityHint?: string }).accessibilityHint}
                >
                  {s.value}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  {s.label}
                </Text>
              </Animated.View>
            ))}
          </View>

          {/* Topics to Review (Weak Topics) */}
          <WeakTopicsChips topics={weakTopics} />

          {/* Recent Flashcard Sets & Recent Quiz Results Split Row */}
          <View style={styles.splitRow}>
            {/* Recent Flashcard Sets */}
            <View
              style={[
                styles.splitCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Continue Studying
                </Text>
                <Link href="/(tabs)/flashcards" asChild>
                  <Pressable hitSlop={6}>
                    <Text style={[styles.linkText, { color: colors.primary }]}>
                      All
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {flashcardSets.length === 0 ? (
                <View style={styles.emptyCardContent}>
                  <Ionicons
                    name="school-outline"
                    size={32}
                    color={colors.muted}
                  />
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    No flashcard sets yet
                  </Text>
                  {bookTotal !== null && bookTotal > 0 ? (
                    <Link href="/(tabs)/library" asChild>
                      <Pressable style={styles.miniButton}>
                        <Text style={styles.miniButtonText}>Generate sets</Text>
                      </Pressable>
                    </Link>
                  ) : (
                    <Link href="/(tabs)/library" asChild>
                      <Pressable style={styles.miniButton}>
                        <Text style={styles.miniButtonText}>Add a book</Text>
                      </Pressable>
                    </Link>
                  )}
                </View>
              ) : (
                <View style={styles.recentList}>
                  {flashcardSets.slice(0, 2).map((item) => (
                    <Link key={item.id} href={`/study/${item.id}`} asChild>
                      <Pressable
                        onPress={() => void hapticImpact("light")}
                        style={[
                          styles.recentItem,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.recentItemTitle,
                              { color: colors.text },
                            ]}
                          >
                            {item.title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.recentItemSub,
                              { color: colors.muted },
                            ]}
                          >
                            {item.card_count} cards • {item.book_title}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={colors.muted}
                        />
                      </Pressable>
                    </Link>
                  ))}
                </View>
              )}
            </View>

            {/* Recent Quiz Results */}
            <View
              style={[
                styles.splitCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Recent Quizzes
                </Text>
                <Link href="/quiz-history" asChild>
                  <Pressable hitSlop={6}>
                    <Text style={[styles.linkText, { color: colors.primary }]}>
                      All
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {quizError ? (
                <View style={styles.emptyCardContent}>
                  <Ionicons name="cloud-offline-outline" size={28} color={colors.muted} />
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    Unable to load recent quizzes
                  </Text>
                  <Pressable
                    onPress={() => void refetchQuizResults()}
                    style={styles.miniButton}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading recent quizzes"
                  >
                    <Text style={styles.miniButtonText}>Retry</Text>
                  </Pressable>
                </View>
              ) : quizLoading ? (
                <View style={styles.emptyCardContent}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    Loading quizzes...
                  </Text>
                </View>
              ) : recentQuizResults.length === 0 ? (
                <View style={styles.emptyCardContent}>
                  <Ionicons
                    name="trophy-outline"
                    size={32}
                    color={colors.muted}
                  />
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    No quizzes taken yet
                  </Text>
                </View>
              ) : (
                <View style={styles.recentList}>
                  {recentQuizResults.map((result) => {
                    const pct = result.percentage ?? 0;
                    const pctColor =
                      pct >= 80
                        ? "#10b981"
                        : pct >= 50
                          ? "#f59e0b"
                          : "#ef4444";

                    return (
                      <Link
                        key={result.id}
                        href={`/quiz-results/${result.id}`}
                        asChild
                      >
                        <Pressable
                          onPress={() => void hapticImpact("light")}
                          style={[
                            styles.recentItem,
                            {
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.resultHeaderRow}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.recentItemTitle,
                                  { color: colors.text, flex: 1 },
                                ]}
                              >
                                {result.set_title ?? "Quiz"}
                              </Text>
                              <Text
                                style={[
                                  styles.pctText,
                                  { color: pctColor },
                                ]}
                              >
                                {pct}%
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.progressTrack,
                                { backgroundColor: `${colors.border}80` },
                              ]}
                            >
                              <View
                                style={[
                                  styles.progressBar,
                                  {
                                    width: `${Math.min(100, Math.max(0, pct))}%`,
                                    backgroundColor: pctColor,
                                  },
                                ]}
                              />
                            </View>

                            <Text
                              style={[
                                styles.scoreDetailText,
                                { color: colors.muted },
                              ]}
                            >
                              {result.score}/{result.total_questions} correct
                            </Text>
                          </View>
                        </Pressable>
                      </Link>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* Quick Start Card for New Users */}
          {isNewUser && (
            <View
              style={[
                styles.newUserCard,
                {
                  backgroundColor: `${colors.primary}10`,
                  borderColor: `${colors.primary}30`,
                },
              ]}
            >
              <Ionicons name="flame" size={32} color={colors.primary} />
              <Text style={[styles.newUserTitle, { color: colors.text }]}>
                Ready to Learn?
              </Text>
              <Text style={[styles.newUserSub, { color: colors.muted }]}>
                Upload a book, select topics, generate flashcards, and test your
                knowledge with gamified quizzes.
              </Text>
              <Link href="/(tabs)/library" asChild>
                <Pressable
                  style={[
                    styles.newUserButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => void hapticImpact("medium")}
                >
                  <Ionicons name="book-outline" size={18} color="#fff" />
                  <Text style={styles.newUserButtonText}>Go to Library</Text>
                </Pressable>
              </Link>
            </View>
          )}

          {/* Quick Actions Row */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, marginTop: 20, marginBottom: 11 },
            ]}
          >
            Jump back in
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
          >
            {[
              {
                label: "Daily review",
                caption: "Build your streak",
                href: "/daily-review",
                icon: "refresh-circle",
                color: "#10b981",
              },
              {
                label: "Scorecards",
                caption: "Share your progress",
                href: "/scorecards",
                icon: "stats-chart",
                color: "#ec4899",
              },
              {
                label: "Quiz results",
                caption: "See recent scores",
                href: "/quiz-history",
                icon: "trophy",
                color: "#f59e0b",
              },
              ...(challengesEnabled
                ? [
                    {
                      label: "Challenges",
                      caption:
                        pendingBadgeValue !== null && pendingBadgeValue > 0
                          ? `${pendingBadgeValue} pending`
                          : challengesError
                            ? "Status unavailable"
                            : "Compete with friends",
                      href: "/challenges",
                      icon: "flash",
                      color: "#6366f1",
                    },
                  ]
                : []),
            ].map((action) => (
              <Link key={action.href} href={action.href as never} asChild>
                <Pressable
                  onPress={() => void hapticImpact("light")}
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      { backgroundColor: `${action.color}18` },
                    ]}
                  >
                    <Ionicons
                      name={action.icon as never}
                      size={24}
                      color={action.color}
                    />
                  </View>
                  <Text style={[styles.actionTitle, { color: colors.text }]}>
                    {action.label}
                  </Text>
                  <Text
                    style={[styles.actionCaption, { color: colors.muted }]}
                  >
                    {action.caption}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={17}
                    color={action.color}
                    style={{ marginTop: 12 }}
                  />
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 120 },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    paddingTop: 120,
  },
  errorTitle: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  errorSub: { fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 17,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
    marginBottom: 4,
  },
  greeting: { fontSize: 26, lineHeight: 31, fontWeight: "900" },

  challengeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  challengeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffffaa",
  },
  challengeTitle: { fontSize: 14, fontWeight: "800" },
  challengeSub: { fontSize: 12, marginTop: 1 },

  hero: {
    minHeight: 224,
    borderRadius: 28,
    padding: 21,
    backgroundColor: "#6437d7",
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#5b21b6",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 8,
  },
  heroOrbOne: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "#ec489944",
    right: -75,
    top: -90,
  },
  heroOrbTwo: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "#2563eb44",
    left: -60,
    bottom: -95,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between" },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff20",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  streakText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  heroTitle: {
    color: "#fff",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    marginTop: 24,
    maxWidth: 280,
  },
  heroCaption: { color: "#ffffffc9", fontSize: 13, marginTop: 5, maxWidth: 270 },
  heroButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 15,
    minHeight: 44,
    marginTop: 20,
  },
  heroButtonText: { color: "#5b21b6", fontSize: 13, fontWeight: "900" },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 11,
  },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: "48.5%",
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    minHeight: 110,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  statValue: { fontSize: 23, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },

  splitRow: { gap: 14, marginBottom: 20 },
  splitCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  linkText: { fontSize: 12, fontWeight: "700" },
  emptyCardContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  emptyText: { fontSize: 13, marginTop: 6 },
  miniButton: {
    marginTop: 10,
    backgroundColor: `${"#6366f1"}18`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  miniButtonText: { color: "#6366f1", fontSize: 12, fontWeight: "700" },
  recentList: { gap: 10 },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recentItemTitle: { fontSize: 14, fontWeight: "700" },
  recentItemSub: { fontSize: 12, marginTop: 2 },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pctText: { fontSize: 13, fontWeight: "800", marginLeft: 8 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  progressBar: { height: "100%", borderRadius: 3 },
  scoreDetailText: { fontSize: 11, marginTop: 4 },

  newUserCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  newUserTitle: { fontSize: 18, fontWeight: "900", marginTop: 8 },
  newUserSub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  newUserButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  newUserButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  actions: { gap: 11, paddingBottom: 10 },
  actionCard: {
    width: 154,
    minHeight: 172,
    borderWidth: 1,
    borderRadius: 21,
    padding: 15,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  actionTitle: { fontSize: 15, fontWeight: "900" },
  actionCaption: { fontSize: 11, lineHeight: 16, marginTop: 3 },
});
