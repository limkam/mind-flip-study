import "react-native-gesture-handler";
import "react-native-reanimated";

import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { setNavigationRouteBridge } from "../api/client";

import { GenerationJobPoller } from "../components/GenerationJobPoller";
import { UpgradeLimitModal } from "../components/UpgradeLimitModal";
import {
  discardLegacyPendingProgress,
  flushPendingProgress,
  subscribeConnectivity,
} from "../lib/offlineStudy";
import { mobileQueryClient } from "../lib/queryClient";
import { setupNotificationHandlers } from "../hooks/usePushNotifications";
import { useTheme } from "../hooks/useTheme";
import { useAuthBootstrap } from "../hooks/useAuthBootstrap";
import { ensureStorageReady } from "../store/storage";
import { useAuthStore } from "../store/authStore";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (typeof sentryDsn === "string" && sentryDsn.length > 0) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
    environment: process.env.EXPO_PUBLIC_ENV ?? "development",
  });
}

function RootNavigator() {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuthStore((state) => state.user?.id);
  const accessToken = useAuthStore((state) => state.accessToken);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);

  useEffect(() => {
    setNavigationRouteBridge(pathname);
  }, [pathname]);

  useEffect(() => {
    if (bootstrapStatus === "authenticated" && userId && accessToken) {
      void flushPendingProgress();
    }
    const unsubNet = subscribeConnectivity(() => {
      if (bootstrapStatus === "authenticated" && userId && accessToken) {
        void flushPendingProgress();
      }
    });
    const unsubPush = setupNotificationHandlers(router);
    return () => {
      unsubNet();
      unsubPush();
    };
  }, [accessToken, bootstrapStatus, router, userId]);

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
        <Stack.Screen name="quiz-results/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="daily-review" options={{ headerShown: true, title: "Daily Review" }} />
        <Stack.Screen name="analytics" options={{ headerShown: true, title: "Analytics" }} />
        <Stack.Screen name="scorecards" options={{ headerShown: true, title: "Scorecards" }} />
        <Stack.Screen name="pricing" options={{ headerShown: true, title: "Plans & Pricing" }} />
        <Stack.Screen name="billing" options={{ headerShown: true, title: "Billing & Credits" }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: true, title: "Leaderboard" }} />
        <Stack.Screen name="study-groups" options={{ headerShown: true, title: "Study Groups" }} />
        <Stack.Screen name="study-groups/[id]" options={{ headerShown: true, title: "Group" }} />
        <Stack.Screen name="challenge-leaderboard" options={{ headerShown: true, title: "Challenge Board" }} />
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

function BootstrapGate() {
  useAuthBootstrap();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.bootstrapStatus);
  const error = useAuthStore((state) => state.bootstrapError);
  const retry = useAuthStore((state) => state.retryAuthBootstrap);

  if (status === "hydrating" || status === "validating") {
    return (
      <View style={[styles.bootstrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.bootstrapText, { color: colors.muted }]}>Verifying your session…</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.bootstrap, { backgroundColor: colors.background }]}>
        <Text style={[styles.bootstrapTitle, { color: colors.text }]}>Unable to verify your session</Text>
        <Text style={[styles.bootstrapText, { color: colors.muted }]}>{error}</Text>
        <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return <RootNavigator />;
}

function AuthenticatedServices() {
  const status = useAuthStore((state) => state.bootstrapStatus);
  return status === "authenticated" ? <GenerationJobPoller /> : null;
}

export default function RootLayout() {
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    void ensureStorageReady().then(() => {
      discardLegacyPendingProgress();
      setStorageReady(true);
    });
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={mobileQueryClient}>
          <AuthenticatedServices />
          <BootstrapGate />
          <UpgradeLimitModal />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootstrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  bootstrapTitle: { fontSize: 21, fontWeight: "800", textAlign: "center" },
  bootstrapText: { marginTop: 12, fontSize: 15, lineHeight: 22, textAlign: "center" },
  retryButton: { marginTop: 22, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
