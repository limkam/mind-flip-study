import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";

import { Screen } from "../components/Screen";
import { ShareScorecardModal } from "../components/scorecards/ShareScorecardModal";
import { useTheme } from "../hooks/useTheme";
import { mobileFeatures } from "../lib/featureFlags";
import {
  fetchScorecards,
  formatPeriodDateRange,
  refreshScorecards,
  type ParsedScorecardsResponse,
} from "../lib/scorecards";
import { useAuthStore } from "../store/authStore";
import type { ScorecardOut, ScorecardPeriodType } from "../types/api";

const PERIODS: Array<{ key: ScorecardPeriodType; label: string }> = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "course", label: "Course" },
];

export default function ScorecardsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const queryClient = useQueryClient();

  const cardRef = useRef<View>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  const [period, setPeriod] = useState<ScorecardPeriodType>("weekly");
  const [selectedId, setSelectedId] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshErrorMsg, setRefreshErrorMsg] = useState<string | null>(null);
  const [backend404Detected, setBackend404Detected] = useState(false);

  const refreshingRef = useRef<{ attemptId: number; userId: string } | null>(
    null,
  );
  const attemptCounterRef = useRef(0);
  const requestSequenceRef = useRef<number>(0);
  const lastWriteSequenceRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const queryEnabled =
    mobileFeatures.scorecards &&
    bootstrapStatus === "authenticated" &&
    Boolean(user?.id);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ParsedScorecardsResponse>({
    queryKey: ["scorecards"],
    queryFn: async () => {
      const seq = ++requestSequenceRef.current;
      const res = await fetchScorecards();
      if (seq >= lastWriteSequenceRef.current) {
        lastWriteSequenceRef.current = seq;
      }
      return res;
    },
    enabled: queryEnabled,
    staleTime: 30_000,
  });

  const cards = data?.scorecards ?? [];
  const discardedCount =
    (data?.discarded_count ?? 0) + (data?.discarded_duplicates_count ?? 0);

  const isBackend404 =
    backend404Detected ||
    (error as { response?: { status?: number } })?.response?.status === 404;

  const handlePullToRefresh = async () => {
    const activeUserId = user?.id;
    if (
      !activeUserId ||
      refreshingRef.current !== null ||
      !mobileFeatures.scorecards
    ) {
      return;
    }

    const attemptId = ++attemptCounterRef.current;
    refreshingRef.current = { attemptId, userId: activeUserId };
    setIsRefreshing(true);
    setRefreshErrorMsg(null);

    // Cancel in-flight GET query to prevent race condition
    void queryClient.cancelQueries({ queryKey: ["scorecards"] });

    const seq = ++requestSequenceRef.current;

    try {
      const res = await refreshScorecards();
      if (
        !mountedRef.current ||
        useAuthStore.getState().user?.id !== activeUserId ||
        !mobileFeatures.scorecards ||
        refreshingRef.current?.attemptId !== attemptId
      ) {
        return;
      }
      if (seq >= lastWriteSequenceRef.current) {
        lastWriteSequenceRef.current = seq;
        queryClient.setQueryData(["scorecards"], res);
      }
      setRefreshErrorMsg(null);
    } catch (err: unknown) {
      if (
        !mountedRef.current ||
        useAuthStore.getState().user?.id !== activeUserId ||
        refreshingRef.current?.attemptId !== attemptId
      ) {
        return;
      }

      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        setBackend404Detected(true);
      } else {
        setRefreshErrorMsg(
          "Could not refresh scorecards. Showing your previous results.",
        );
      }
    } finally {
      if (refreshingRef.current?.attemptId === attemptId) {
        refreshingRef.current = null;
        if (mountedRef.current) {
          setIsRefreshing(false);
        }
      }
    }
  };

  const filtered = useMemo(
    () => cards.filter((item) => item.period_type === period),
    [cards, period],
  );

  const card = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const metrics = card?.metrics ?? {};

  const mastery =
    metrics.average_assessment_score == null
      ? card?.score ?? null
      : Math.round(metrics.average_assessment_score);

  const title =
    card?.period_type === "course"
      ? metrics.course_title || "Course"
      : user?.full_name || "Bilkeys Learner";

  useEffect(() => {
    if (!card?.id) return;
    reveal.setValue(0);
    Animated.spring(reveal, {
      toValue: 1,
      stiffness: 120,
      damping: 15,
      useNativeDriver: true,
    }).start();
  }, [card?.id, reveal]);

  async function shareScorecardImage() {
    if (!cardRef.current || !card || !mobileFeatures.scorecards) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Sharing unavailable",
          "Your device does not currently provide a native share sheet.",
        );
        return;
      }
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: "Share your Bilkeys scorecard",
      });
    } catch {
      Alert.alert("Could not share image", "Please try again.");
    } finally {
      setSharing(false);
    }
  }

  // 1. Rollout Gated / Backend 404 Unavailable State
  if (!mobileFeatures.scorecards || isBackend404) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Scorecards" }} />
        <View style={styles.centerContainer}>
          <Ionicons name="stats-chart-outline" size={48} color={colors.muted} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>
            Scorecards unavailable
          </Text>
          <Text style={[styles.stateBody, { color: colors.muted }]}>
            Scorecards are not currently available.
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/more")}
            accessibilityRole="button"
            accessibilityLabel="Back to More"
          >
            <Text style={styles.primaryBtnText}>Back to More</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  // 2. Auth Loading Gate
  if (bootstrapStatus === "hydrating" || bootstrapStatus === "validating") {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Scorecards" }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[styles.stateBody, { color: colors.muted, marginTop: 12 }]}
            accessibilityLiveRegion="polite"
          >
            Verifying your session…
          </Text>
        </View>
      </Screen>
    );
  }

  // 3. Initial Loading (No Cache)
  if (isLoading && !cards.length) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Scorecards" }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[styles.stateBody, { color: colors.muted, marginTop: 12 }]}
            accessibilityLiveRegion="polite"
          >
            Loading scorecards…
          </Text>
        </View>
      </Screen>
    );
  }

  // 4. Hard Initial Error State (No Cache or All-Malformed Response)
  if (isError && !cards.length) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Scorecards" }} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>
            Unable to load scorecards
          </Text>
          <Text style={[styles.stateBody, { color: colors.muted }]}>
            Check your connection and try again.
          </Text>
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => void refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading scorecards"
            >
              <Text style={styles.primaryBtnText}>Retry</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => router.replace("/(tabs)/more")}
              accessibilityRole="button"
              accessibilityLabel="Back to More"
            >
              <Text
                style={[styles.secondaryBtnText, { color: colors.text }]}
              >
                Back to More
              </Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Scorecards" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handlePullToRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.title, { color: colors.text }]}>
          My Scorecard
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          A clear view of your recent learning progress
        </Text>

        {/* Non-blocking query fetching notice */}
        {isFetching && !isRefreshing && (
          <View
            style={[
              styles.noticeBanner,
              { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}40` },
            ]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.primary }]}>
              Updating scorecards…
            </Text>
          </View>
        )}

        {/* Non-blocking background query error */}
        {isError && cards.length > 0 && !isFetching && !isRefreshing && (
          <View
            style={[
              styles.noticeBanner,
              { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}40` },
            ]}
          >
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={[styles.noticeText, { color: colors.danger, flex: 1 }]}>
              Scorecards may be out of date.
            </Text>
            <Pressable
              onPress={() => void refetch()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry background refetch"
            >
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Refresh Error with Cached Data Notice */}
        {refreshErrorMsg && (
          <View
            style={[
              styles.noticeBanner,
              { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}40` },
            ]}
          >
            <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
            <Text style={[styles.noticeText, { color: colors.danger, flex: 1 }]}>
              {refreshErrorMsg}
            </Text>
            <Pressable
              onPress={() => void handlePullToRefresh()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry pull to refresh"
            >
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Discarded Malformed Data Notice */}
        {discardedCount > 0 && (
          <View
            style={[
              styles.noticeBanner,
              { backgroundColor: `${colors.muted}15`, borderColor: colors.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              Some scorecard records could not be displayed.
            </Text>
          </View>
        )}

        {/* Period Selector Tabs */}
        <View style={styles.periods} accessibilityRole="tablist">
          {PERIODS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === item.key }}
              onPress={() => {
                setPeriod(item.key);
                setSelectedId(undefined);
              }}
              style={[
                styles.periodButton,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    period === item.key ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text
                style={{
                  color: period === item.key ? colors.onPrimary : colors.text,
                  fontWeight: "700",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Completely empty state (no cards at all across all periods) */}
        {!isLoading && cards.length === 0 && (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="trophy-outline" size={42} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No scorecards yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              Complete study activity to generate your first scorecard.
            </Text>
            <View style={styles.btnRow}>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/(tabs)/library")}
                accessibilityRole="button"
                accessibilityLabel="Go to Library"
              >
                <Text style={styles.primaryBtnText}>Go to Library</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => void handlePullToRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Refresh scorecards"
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                  Refresh scorecards
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Selected period empty state */}
        {!isLoading && cards.length > 0 && !card && (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="sparkles-outline" size={36} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No {period} activity yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              {period === "course"
                ? "A course scorecard appears automatically after your first activity in a course."
                : `Complete flashcard sets or quizzes to generate your ${period} scorecard.`}
            </Text>
          </View>
        )}

        {/* Multiple Scorecards Choice Selector */}
        {filtered.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.choices}
          >
            {filtered.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedId(item.id)}
                style={[
                  styles.choice,
                  {
                    borderColor:
                      item.id === card?.id ? colors.primary : colors.border,
                    backgroundColor:
                      item.id === card?.id ? `${colors.primary}12` : colors.surface,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Scorecard period ${formatPeriodDateRange(item.period_start, item.period_end)}`}
              >
                <Text
                  style={{
                    color: item.id === card?.id ? colors.primary : colors.text,
                    fontWeight: item.id === card?.id ? "700" : "400",
                    fontSize: 13,
                  }}
                >
                  {formatPeriodDateRange(item.period_start, item.period_end)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Active Scorecard Card */}
        {card && (
          <>
            <Animated.View
              style={{
                opacity: reveal,
                transform: [
                  {
                    scale: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1],
                    }),
                  },
                ],
              }}
            >
              <View
                ref={cardRef}
                collapsable={false}
                style={styles.scorecard}
                accessibilityLabel={`${PERIODS.find((p) => p.key === period)?.label ?? "Learning"} score, ${metrics.data_state === "empty" ? "no score calculated" : `${card.score} out of 100`}`}
              >
                <View style={styles.orbOne} />
                <View style={styles.orbTwo} />
                <View style={styles.brandRow}>
                  <Text style={styles.brand}>🎓 BILKEYS</Text>
                  <Text style={styles.pill}>
                    {PERIODS.find((item) => item.key === period)?.label}
                  </Text>
                </View>

                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardMeta}>
                  {formatPeriodDateRange(card.period_start, card.period_end)}
                </Text>
                <Text style={styles.cardSubMeta}>
                  {metrics.assessments_completed ?? 0} assessments ·{" "}
                  {metrics.cards_reviewed ?? 0} cards reviewed
                </Text>

                <Text style={styles.score}>
                  {card.score}
                  <Text style={styles.scoreSuffix}>/100</Text>
                </Text>

                <Text style={styles.formula}>
                  {metrics.data_state === "empty"
                    ? "No study activity yet"
                    : metrics.data_state === "partial"
                      ? "Limited activity"
                      : "Overall learning score"}{" "}
                  · Formula {card.formula_version}
                </Text>

                {metrics.data_state === "partial" && (
                  <Text style={styles.partialNotice}>
                    This scorecard is based on limited activity.
                  </Text>
                )}

                <View style={styles.stats}>
                  <Stat
                    value={
                      metrics.cards_reviewed != null
                        ? String(metrics.cards_reviewed)
                        : "—"
                    }
                    label="Cards reviewed"
                  />
                  <Stat
                    value={
                      metrics.current_streak != null
                        ? String(metrics.current_streak)
                        : "—"
                    }
                    label="Day streak"
                  />
                  <Stat
                    value={
                      metrics.learning_minutes != null
                        ? `${Math.round((metrics.learning_minutes / 6)) / 10}h`
                        : "—"
                    }
                    label="Time studied"
                  />
                  <Stat
                    value={mastery != null ? `${mastery}%` : "—"}
                    label="Mastery"
                  />
                </View>

                {metrics.personal_best && (
                  <Text style={styles.best}>Personal best</Text>
                )}

                <Text style={styles.footer}>Keep learning with Bilkeys 🚀</Text>
              </View>
            </Animated.View>

            <View style={styles.shareActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create public scorecard share link"
                onPress={() => setShareModalVisible(true)}
                style={[
                  styles.shareButton,
                  { backgroundColor: colors.primary, flex: 1 },
                ]}
              >
                <Ionicons name="link-outline" size={20} color={colors.onPrimary} />
                <Text style={[styles.shareText, { color: colors.onPrimary }]}>Create public link</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share scorecard image"
                disabled={sharing}
                onPress={() => void shareScorecardImage()}
                style={[
                  styles.shareButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    flex: 1,
                    opacity: sharing ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="share-social-outline"
                  size={20}
                  color={colors.text}
                />
                <Text style={[styles.shareText, { color: colors.text }]}>
                  {sharing ? "Preparing…" : "Share image"}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <ShareScorecardModal
        visible={shareModalVisible}
        scorecard={card}
        onClose={() => setShareModalVisible(false)}
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 18 },

  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  stateBody: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    alignItems: "center",
  },
  primaryBtn: {
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "700" },

  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: { fontSize: 13, fontWeight: "600" },

  periods: { flexDirection: "row", gap: 8, marginBottom: 18 },
  periodButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },

  emptyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", marginTop: 12 },
  emptyBody: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  choices: { gap: 8, marginBottom: 14 },
  choice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },

  scorecard: {
    width: "100%",
    aspectRatio: 4 / 4.8,
    overflow: "hidden",
    backgroundColor: "#6338d8",
    padding: 24,
    borderRadius: 24,
  },
  orbOne: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#2563eb55",
    left: -100,
    top: 100,
  },
  orbTwo: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "#db277755",
    right: -90,
    bottom: -40,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  pill: {
    color: "#fff",
    fontWeight: "700",
    backgroundColor: "#ffffff25",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 6,
    fontSize: 12,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    marginTop: 20,
  },
  cardMeta: { color: "#ffffffee", fontSize: 13, fontWeight: "700", marginTop: 4 },
  cardSubMeta: { color: "#ffffffd9", fontSize: 12, marginTop: 2 },
  score: {
    color: "#fff",
    fontSize: 64,
    lineHeight: 72,
    fontWeight: "900",
    marginTop: 10,
  },
  scoreSuffix: { fontSize: 20, color: "#ffffffcc" },
  formula: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 2 },
  partialNotice: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  stat: {
    width: "48%",
    backgroundColor: "#ffffff20",
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  statValue: { color: "#fff", fontSize: 21, fontWeight: "900" },
  statLabel: { color: "#ffffffdd", fontSize: 11, fontWeight: "700", marginTop: 2 },
  best: { color: "#fff", fontWeight: "800", marginTop: 10, fontSize: 13 },
  footer: {
    color: "#fff",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: "#ffffff45",
    paddingTop: 10,
  },
  shareActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  shareButton: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  shareText: { fontSize: 14, fontWeight: "800" },
});
