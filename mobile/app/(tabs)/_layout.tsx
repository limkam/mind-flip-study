import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { api } from "../../api/client";
import { GenerationStatusBanner } from "../../components/GenerationStatusBanner";
import { fetchFlashcardSetsList } from "../../lib/flashcardSets";
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
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;
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
  }, [accessToken, queryClient]);

  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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
