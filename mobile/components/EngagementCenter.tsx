import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { mobileFeatures } from "../lib/featureFlags";
import { hapticImpact } from "../lib/haptics";
import { useAuthStore } from "../store/authStore";
import type {
  NotificationOut,
  NotificationPage,
  NudgeOut,
  UnreadCount,
} from "../types/api";

function generateEventKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeActionUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return null;
}

function parseNotificationOut(raw: unknown): NotificationOut | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.user_id !== "string" ||
    typeof obj.category !== "string" ||
    typeof obj.type !== "string" ||
    typeof obj.title !== "string" ||
    typeof obj.body !== "string" ||
    typeof obj.created_at !== "string" ||
    Number.isNaN(Date.parse(obj.created_at))
  ) {
    return null;
  }
  return {
    id: obj.id,
    user_id: obj.user_id,
    category: obj.category,
    type: obj.type,
    title: obj.title,
    body: obj.body,
    action_url: safeActionUrl(obj.action_url as string | null),
    created_at: obj.created_at,
    read_at: typeof obj.read_at === "string" ? obj.read_at : null,
    seen_at: typeof obj.seen_at === "string" ? obj.seen_at : null,
    expires_at: typeof obj.expires_at === "string" ? obj.expires_at : null,
  };
}

function parseNotificationPage(raw: unknown): NotificationPage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    !Array.isArray(obj.items) ||
    typeof obj.page !== "number" ||
    typeof obj.size !== "number" ||
    typeof obj.total !== "number" ||
    typeof obj.has_more !== "boolean"
  ) {
    return null;
  }
  const validItems: NotificationOut[] = [];
  for (const item of obj.items) {
    const parsed = parseNotificationOut(item);
    if (parsed) validItems.push(parsed);
  }
  return {
    items: validItems,
    page: obj.page,
    size: obj.size,
    total: obj.total,
    has_more: obj.has_more,
    next_before_created_at:
      typeof obj.next_before_created_at === "string"
        ? obj.next_before_created_at
        : null,
    next_before_id:
      typeof obj.next_before_id === "string" ? obj.next_before_id : null,
  };
}

function parseUnreadCount(raw: unknown): UnreadCount | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.count !== "number") return null;
  return { count: Math.max(0, obj.count) };
}

function parseNudgeOut(raw: unknown): NudgeOut | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.nudge_key !== "string" ||
    typeof obj.placement !== "string" ||
    typeof obj.category !== "string" ||
    typeof obj.priority !== "number" ||
    typeof obj.title !== "string" ||
    typeof obj.body !== "string" ||
    typeof obj.action_label !== "string" ||
    typeof obj.action_url !== "string"
  ) {
    return null;
  }
  return {
    id: obj.id,
    nudge_key: obj.nudge_key,
    placement: obj.placement,
    category: obj.category,
    priority: obj.priority,
    title: obj.title,
    body: obj.body,
    action_label: obj.action_label,
    action_url: safeActionUrl(obj.action_url) ?? "",
    expires_at: typeof obj.expires_at === "string" ? obj.expires_at : null,
  };
}

export function EngagementCenter() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const isAuthenticated =
    bootstrapStatus === "authenticated" && Boolean(currentUser?.id);

  const [open, setOpen] = useState(false);
  const [uiDeletingIds, setUiDeletingIds] = useState<Set<string>>(new Set());
  const deletingIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const res = await api.get("/engagement/notifications/unread-count");
      return parseUnreadCount(res.data) ?? { count: 0 };
    },
    enabled: isAuthenticated && mobileFeatures.notifications,
    refetchInterval: 60_000,
  });

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: async () => {
      const res = await api.get("/engagement/notifications", {
        params: { page: 1, size: 20 },
      });
      return parseNotificationPage(res.data);
    },
    enabled: open && isAuthenticated && mobileFeatures.notifications,
  });

  useEffect(() => {
    if (!unreadData?.count) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [scale, unreadData?.count]);

  const refreshNotifications = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] }),
    ]);

  const readAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/engagement/notifications/read-all");
      return parseUnreadCount(res.data);
    },
    onSuccess: (parsed) => {
      const activeUserId = currentUser?.id;
      if (!mountedRef.current || useAuthStore.getState().user?.id !== activeUserId) {
        return;
      }
      if (parsed) {
        queryClient.setQueryData(["notifications-unread"], parsed);
      }
      void refreshNotifications();
    },
  });

  async function handleOpenNotification(item: NotificationOut) {
    if (deletingIdsRef.current.has(item.id)) return;
    void hapticImpact("light");
    const activeUserId = currentUser?.id;

    if (!item.read_at && activeUserId) {
      try {
        const res = await api.patch(
          `/engagement/notifications/${item.id}/read`,
        );
        const updated = parseNotificationOut(res.data);
        if (
          mountedRef.current &&
          updated &&
          useAuthStore.getState().user?.id === activeUserId
        ) {
          queryClient.setQueryData<NotificationPage | null>(
            ["notifications", "recent"],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                items: old.items.map((i) => (i.id === item.id ? updated : i)),
              };
            },
          );
        }
      } catch {
        // Continue navigation if read sync fails
      }
      if (mountedRef.current && useAuthStore.getState().user?.id === activeUserId) {
        void refreshNotifications();
      }
    }

    if (mountedRef.current) setOpen(false);
    const validUrl = safeActionUrl(item.action_url);
    if (validUrl) {
      router.push(validUrl as never);
    }
  }

  async function handleDeleteNotification(item: NotificationOut) {
    const activeUserId = currentUser?.id;
    if (!activeUserId || deletingIdsRef.current.has(item.id)) return;

    deletingIdsRef.current.add(item.id);
    setUiDeletingIds((prev) => new Set(prev).add(item.id));

    try {
      await api.delete(`/engagement/notifications/${item.id}`);

      if (!mountedRef.current || useAuthStore.getState().user?.id !== activeUserId) {
        return;
      }

      queryClient.setQueryData<NotificationPage | null>(
        ["notifications", "recent"],
        (old) => {
          if (!old) return old;
          const filtered = old.items.filter((i) => i.id !== item.id);
          return {
            ...old,
            items: filtered,
            total: Math.max(0, old.total - 1),
          };
        },
      );
      void refreshNotifications();
    } catch (err: unknown) {
      if (!mountedRef.current || useAuthStore.getState().user?.id !== activeUserId) {
        return;
      }

      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        queryClient.setQueryData<NotificationPage | null>(
          ["notifications", "recent"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              items: old.items.filter((i) => i.id !== item.id),
              total: Math.max(0, old.total - 1),
            };
          },
        );
        void refreshNotifications();
      } else if (status !== 401) {
        Alert.alert(
          "Delete failed",
          "The notification could not be deleted. Please check your connection and try again.",
        );
      }
    } finally {
      deletingIdsRef.current.delete(item.id);
      if (mountedRef.current) {
        setUiDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  }

  if (!mobileFeatures.notifications) {
    return null;
  }

  const unreadCountVal = Math.min(unreadData?.count ?? 0, 99);

  return (
    <>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={() => {
            void hapticImpact("light");
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${unreadCountVal} unread notifications`}
          style={[
            styles.bell,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {unreadCountVal > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCountVal}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Notifications
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Updates that keep your learning moving
              </Text>
            </View>

            {unreadCountVal > 0 && (
              <Pressable
                onPress={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                style={[
                  styles.readAll,
                  { backgroundColor: `${colors.primary}18` },
                ]}
              >
                <Ionicons
                  name="checkmark-done"
                  size={17}
                  color={colors.primary}
                />
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  Read all
                </Text>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.notificationList}>
            {isLoading && (
              <Text style={[styles.empty, { color: colors.muted }]}>
                Loading updates…
              </Text>
            )}

            {!isLoading && !pageData?.items?.length && (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="notifications-off-outline"
                  size={38}
                  color={colors.muted}
                />
                <Text style={[styles.empty, { color: colors.muted }]}>
                  You’re all caught up.
                </Text>
              </View>
            )}

            {pageData?.items?.map((item) => {
              const isDeleting = uiDeletingIds.has(item.id);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.notificationContainer,
                    {
                      backgroundColor: item.read_at
                        ? colors.surface
                        : `${colors.primary}12`,
                      borderColor: colors.border,
                      opacity: isDeleting ? 0.4 : 1,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => void handleOpenNotification(item)}
                    disabled={isDeleting}
                    style={styles.notificationMain}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                  >
                    <View
                      style={[
                        styles.notificationIcon,
                        { backgroundColor: `${colors.primary}18` },
                      ]}
                    >
                      <Ionicons
                        name={
                          item.category === "achievements"
                            ? "trophy-outline"
                            : item.category === "streaks"
                              ? "flame-outline"
                              : "sparkles-outline"
                        }
                        size={19}
                        color={colors.primary}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.notificationTitle,
                          { color: colors.text },
                        ]}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={[
                          styles.notificationBody,
                          { color: colors.muted },
                        ]}
                      >
                        {item.body}
                      </Text>
                      <Text style={[styles.time, { color: colors.muted }]}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {!item.read_at && (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => void handleDeleteNotification(item)}
                    disabled={isDeleting}
                    hitSlop={10}
                    style={styles.deleteButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${item.title}`}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function ContextualNudge() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const isAuthenticated =
    bootstrapStatus === "authenticated" && Boolean(currentUser?.id);

  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const dismissLockRef = useRef<string | null>(null);

  const translate = useRef(new Animated.Value(14)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const impressionKeyRef = useRef<{ userNudgeKey: string; key: string } | null>(null);
  const clickKeyRef = useRef<{ userNudgeKey: string; key: string } | null>(null);
  const dismissKeyRef = useRef<{ userNudgeKey: string; key: string } | null>(null);
  const postedImpressionKeyRef = useRef<string | null>(null);

  const placement = "dashboard";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { data: nudge } = useQuery({
    queryKey: ["engagement-nudge", placement],
    queryFn: async () => {
      const res = await api.get("/engagement/nudges/current", {
        params: { placement },
      });
      return parseNudgeOut(res.data);
    },
    enabled: isAuthenticated && mobileFeatures.nudges,
    retry: 1,
  });

  const activeUserId = currentUser?.id;
  const userNudgeKey =
    activeUserId && nudge?.id ? `${activeUserId}:${nudge.id}` : null;

  const isHidden = Boolean(userNudgeKey && hiddenKey === userNudgeKey);
  const activeNudge =
    mobileFeatures.nudges && nudge && userNudgeKey && !isHidden ? nudge : null;

  useEffect(() => {
    if (!activeNudge?.id || !userNudgeKey) return;

    if (impressionKeyRef.current?.userNudgeKey !== userNudgeKey) {
      impressionKeyRef.current = {
        userNudgeKey,
        key: generateEventKey(),
      };
      clickKeyRef.current = {
        userNudgeKey,
        key: generateEventKey(),
      };
      dismissKeyRef.current = {
        userNudgeKey,
        key: generateEventKey(),
      };

      Animated.parallel([
        Animated.spring(translate, { toValue: 0, useNativeDriver: true }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    }

    if (
      postedImpressionKeyRef.current !== userNudgeKey &&
      impressionKeyRef.current?.userNudgeKey === userNudgeKey
    ) {
      postedImpressionKeyRef.current = userNudgeKey;
      const targetUserId = activeUserId;
      void api
        .post(`/engagement/nudges/${activeNudge.id}/impression`, {
          idempotency_key: impressionKeyRef.current.key,
        })
        .catch(() => {
          if (
            mountedRef.current &&
            postedImpressionKeyRef.current === userNudgeKey &&
            useAuthStore.getState().user?.id === targetUserId
          ) {
            postedImpressionKeyRef.current = null;
          }
        });
    }
  }, [activeNudge?.id, activeUserId, opacity, translate, userNudgeKey]);

  if (!activeNudge || !userNudgeKey) return null;

  async function handleFollow() {
    if (!activeNudge || !userNudgeKey) return;
    void hapticImpact("light");
    const targetUserId = activeUserId;

    if (clickKeyRef.current?.userNudgeKey === userNudgeKey) {
      void api
        .post(`/engagement/nudges/${activeNudge.id}/click`, {
          idempotency_key: clickKeyRef.current.key,
        })
        .catch(() => undefined);
    }

    if (
      mountedRef.current &&
      useAuthStore.getState().user?.id === targetUserId
    ) {
      const validUrl = safeActionUrl(activeNudge.action_url);
      if (validUrl) {
        router.push(validUrl as never);
      }
    }
  }

  async function handleDismiss() {
    if (!activeNudge || !userNudgeKey) return;
    const targetUserId = activeUserId;
    const targetNudgeId = activeNudge.id;
    const attemptId = generateEventKey();
    const lockKey = `${userNudgeKey}:${attemptId}`;

    if (dismissLockRef.current !== null) return;
    dismissLockRef.current = lockKey;

    const idempotencyKey =
      dismissKeyRef.current?.userNudgeKey === userNudgeKey
        ? dismissKeyRef.current.key
        : generateEventKey();

    try {
      await api.post(`/engagement/nudges/${targetNudgeId}/dismissal`, {
        idempotency_key: idempotencyKey,
      });

      if (
        !mountedRef.current ||
        useAuthStore.getState().user?.id !== targetUserId
      ) {
        return;
      }

      setHiddenKey(userNudgeKey);
      queryClient.setQueryData(["engagement-nudge", placement], null);
      void queryClient.invalidateQueries({
        queryKey: ["engagement-nudge", placement],
      });
    } catch (err: unknown) {
      if (
        !mountedRef.current ||
        useAuthStore.getState().user?.id !== targetUserId
      ) {
        return;
      }

      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setHiddenKey(userNudgeKey);
        queryClient.setQueryData(["engagement-nudge", placement], null);
        void queryClient.invalidateQueries({
          queryKey: ["engagement-nudge", placement],
        });
      } else if (status !== 401) {
        Alert.alert(
          "Dismissal failed",
          "The suggestion could not be dismissed. Please try again.",
        );
      }
    } finally {
      if (dismissLockRef.current === lockKey) {
        dismissLockRef.current = null;
      }
    }
  }

  if (!activeNudge) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.nudge,
        {
          backgroundColor: `${colors.primary}12`,
          borderColor: `${colors.primary}45`,
          opacity,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      <View style={[styles.nudgeIcon, { backgroundColor: colors.primary }]}>
        <Ionicons name="sparkles" size={19} color="#fff" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.nudgeTitle, { color: colors.text }]}>
          {activeNudge.title}
        </Text>
        <Text style={[styles.nudgeBody, { color: colors.muted }]}>
          {activeNudge.body}
        </Text>
        <Pressable onPress={() => void handleFollow()}>
          <Text
            style={{ color: colors.primary, fontWeight: "800", marginTop: 8 }}
          >
            {activeNudge.action_label} →
          </Text>
        </Pressable>
      </View>

      <Pressable
        hitSlop={12}
        onPress={() => void handleDismiss()}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${activeNudge.title}`}
      >
        <Ionicons name="close" size={19} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: -4,
    top: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#080b18aa",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "78%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 9,
  },
  sheetHeader: {
    padding: 20,
    paddingTop: 14,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sheetTitle: { fontSize: 22, fontWeight: "900" },
  readAll: {
    flexDirection: "row",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  notificationList: { padding: 14, gap: 9, paddingBottom: 40 },
  notificationContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 17,
    paddingRight: 8,
  },
  notificationMain: {
    flex: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13,
    paddingRight: 4,
    alignItems: "flex-start",
  },
  deleteButton: {
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationTitle: { fontSize: 14, fontWeight: "800" },
  notificationBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  time: { fontSize: 10, marginTop: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  emptyWrap: { alignItems: "center", paddingVertical: 70, gap: 10 },
  empty: { textAlign: "center", padding: 20 },
  nudge: {
    flexDirection: "row",
    gap: 12,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  nudgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeTitle: { fontSize: 15, fontWeight: "900" },
  nudgeBody: { fontSize: 12, lineHeight: 18, marginTop: 2 },
});
