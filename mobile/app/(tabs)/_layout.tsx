import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../../api/client";
import { GenerationStatusBanner } from "../../components/GenerationStatusBanner";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { hapticSelection } from "../../lib/haptics";
import { TAB_NAV_ITEMS } from "../../lib/navigation";
import { normalizePage } from "../../lib/pagination";
import { useTheme } from "../../hooks/useTheme";
import { useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";
import type { BookOut, Paginated } from "../../types/api";

export default function TabsLayout() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!accessToken || bootstrapStatus !== "authenticated") return;
    void queryClient.prefetchQuery({
      queryKey: ["flashcard-sets"],
      queryFn: fetchFlashcardSetsList,
    });
    void queryClient.prefetchInfiniteQuery({
      queryKey: ["books", "infinite"],
      initialPageParam: 1,
      getNextPageParam: (last: Paginated<BookOut>) => (last?.has_more ? last.page + 1 : undefined),
      queryFn: async ({ pageParam }) => {
        const { data } = await api.get<Paginated<BookOut> | BookOut[]>("/books/", {
          params: { page: pageParam, size: 20 },
        });
        return normalizePage(data, pageParam, 20);
      },
    });
  }, [accessToken, bootstrapStatus, queryClient]);

  if (!accessToken || bootstrapStatus !== "authenticated") {
    if (bootstrapStatus === "hydrating" || bootstrapStatus === "validating" || bootstrapStatus === "error") {
      return <Redirect href="/" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <Tabs
        screenListeners={({ navigation, route }) => ({
          tabPress: () => {
            const state = navigation.getState();
            if (state.routes[state.index]?.name !== route.name) {
              void hapticSelection();
            }
          },
        })}
        screenOptions={({ route }) => {
          const item = TAB_NAV_ITEMS.find((candidate) => candidate.name === route.name);
          return {
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: isDark ? colors.primaryMuted : colors.primary,
            tabBarInactiveTintColor: isDark ? colors.textSecondary : colors.textMuted,
            tabBarAccessibilityLabel: item?.accessibilityLabel,
            tabBarStyle: {
              height: 58 + insets.bottom,
              paddingTop: TOKENS.spacing.xs,
              paddingBottom: Math.max(insets.bottom, TOKENS.spacing.xs),
              backgroundColor: colors.surfaceElevated,
              borderTopColor: colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
              shadowColor: isDark ? "#000000" : TOKENS.colors.light.textPrimary,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: isDark ? 0.22 : 0.07,
              shadowRadius: 8,
              elevation: 8,
            },
            tabBarItemStyle: styles.tabItem,
            tabBarIconStyle: styles.iconSlot,
            tabBarLabel: ({ focused, color }) => (
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, { color, fontWeight: focused ? "800" : "600" }]}
              >
                {item?.label ?? route.name}
              </Text>
            ),
            tabBarIcon: ({ focused, color }) => (
              <View style={styles.iconWrap}>
                <View
                  style={[
                    styles.activeIndicator,
                    { backgroundColor: colors.primary, opacity: focused ? 1 : 0 },
                  ]}
                />
                <Ionicons
                  name={focused ? item?.activeIcon ?? "ellipse" : item?.icon ?? "ellipse-outline"}
                  color={color}
                  size={23}
                />
              </View>
            ),
          };
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="flashcards" options={{ title: "Study" }} />
        <Tabs.Screen name="challenges" options={{ title: "Challenges", href: null }} />
        <Tabs.Screen name="more" options={{ title: "More" }} />
      </Tabs>
      <GenerationStatusBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  tabItem: {
    minHeight: 48,
    paddingHorizontal: TOKENS.spacing.xs,
  },
  iconSlot: {
    marginTop: 0,
  },
  iconWrap: {
    minWidth: 44,
    height: 30,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 18,
    height: 2,
    borderRadius: TOKENS.radii.pill,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
  },
});
