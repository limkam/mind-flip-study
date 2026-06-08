import "react-native-gesture-handler";
import "react-native-reanimated";

import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { flushPendingProgress, subscribeConnectivity } from "../lib/offlineStudy";
import { setupNotificationHandlers } from "../hooks/usePushNotifications";
import { useTheme } from "../hooks/useTheme";
import { ensureStorageReady } from "../store/storage";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (typeof sentryDsn === "string" && sentryDsn.length > 0) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
    environment: process.env.EXPO_PUBLIC_ENV ?? "development",
  });
}

const queryClient = new QueryClient();

function RootNavigator() {
  const { isDark, colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    void flushPendingProgress();
    const unsubNet = subscribeConnectivity(() => {
      void flushPendingProgress();
    });
    const unsubPush = setupNotificationHandlers(router);
    return () => {
      unsubNet();
      unsubPush();
    };
  }, [router]);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quiz-history" options={{ headerShown: true, title: "Quiz Results" }} />
        <Stack.Screen name="daily-review" options={{ headerShown: true, title: "Daily Review" }} />
        <Stack.Screen name="analytics" options={{ headerShown: true, title: "Analytics" }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: true, title: "Leaderboard" }} />
        <Stack.Screen name="folders" options={{ headerShown: true, title: "Collections" }} />
        <Stack.Screen name="profile" options={{ headerShown: true, title: "My Profile" }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: "Settings" }} />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: "Feedback" }} />
        <Stack.Screen name="onboarding" options={{ headerShown: true, title: "Profile setup" }} />
        <Stack.Screen name="study/[id]" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="book/[id]" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="games/[setId]/index" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="games/[setId]/[slug]" options={{ presentation: "modal", headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    void ensureStorageReady().then(() => setStorageReady(true));
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
