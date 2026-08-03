import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { api } from "../../api/client";
import { GenerationStatusBanner } from "../../components/GenerationStatusBanner";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
import { fetchEntitlementsSnapshot } from "../../lib/billing";
import { normalizePage } from "../../lib/pagination";
import { useTheme } from "../../hooks/useTheme";
import { useAuthStore } from "../../store/authStore";
import type { BookOut, Paginated } from "../../types/api";

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home-outline",
  Library: "library-outline",
  "My Flashcards": "school-outline",
  Challenges: "flash-outline",
  Menu: "menu-outline",
};

export default function TabsLayout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const entitlements = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: !!accessToken && bootstrapStatus === "authenticated",
  });
  const challengesAllowed = !entitlements.isError && entitlements.data?.features.challenges === true;

  useEffect(() => {
    if (!accessToken || bootstrapStatus !== "authenticated") return;
    void queryClient.prefetchQuery({
      queryKey: ["flashcard-sets"],
      queryFn: fetchFlashcardSetsList,
    });
    void queryClient.prefetchInfiniteQuery({
      queryKey: ["books", "paginated"],
      initialPageParam: 1,
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
    <View style={{ flex: 1 }}>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
          height: 70,
          paddingTop: 8,
          paddingBottom: 9,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          borderRadius: 24,
          shadowColor: "#111827",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 14,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarItemStyle: { borderRadius: 18 },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitle: "MindFlip",
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS.Dashboard} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS.Library} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="flashcards"
        options={{
          title: "Flashcards",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS["My Flashcards"]} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Challenges",
          href: challengesAllowed ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS.Challenges} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS.Menu} color={color} size={size} />
          ),
        }}
      />
      {/* Legacy tab files removed to prevent redirect loops */}
      </Tabs>
      <GenerationStatusBanner />
    </View>
  );
}
