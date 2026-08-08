import "react-native-gesture-handler";
import "react-native-reanimated";

import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { setNavigationRouteBridge } from "../api/client";

import { GenerationJobPoller } from "../components/GenerationJobPoller";
import { UpgradeLimitModal } from "../components/UpgradeLimitModal";
import { CelebrationProvider } from "../context/CelebrationContext";
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

import { MindFlipLogoMark } from "../components/brand/MindFlipBrand";
import { AppScreen, ErrorState } from "../components/ui";
import { TOKENS } from "../theme/tokens";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash may already be hidden during fast refresh.
});

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
        <Stack.Screen name="profile" options={{ headerShown: true, title: "Profile" }} />
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

type BootstrapGateProps = {
  onReady: () => void;
};

function BootstrapGate({ onReady }: BootstrapGateProps) {
  useAuthBootstrap();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.bootstrapStatus);
  const error = useAuthStore((state) => state.bootstrapError);
  const retry = useAuthStore((state) => state.retryAuthBootstrap);
  const [showBrand, setShowBrand] = useState(true);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.94)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const gateOpacity = useRef(new Animated.Value(1)).current;
  const isBootstrapping = status === "hydrating" || status === "validating";

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReduceMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null || !showBrand) return;

    markOpacity.setValue(0);
    markScale.setValue(reduceMotion ? 1 : 0.94);
    copyOpacity.setValue(0);
    gateOpacity.setValue(1);

    const entrance = Animated.parallel([
      Animated.timing(markOpacity, {
        toValue: 1,
        duration: reduceMotion ? 80 : 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(markScale, {
        toValue: 1,
        duration: reduceMotion ? 0 : 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(reduceMotion ? 0 : 90),
        Animated.timing(copyOpacity, {
          toValue: 1,
          duration: reduceMotion ? 80 : 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [copyOpacity, gateOpacity, markOpacity, markScale, reduceMotion, showBrand]);

  useEffect(() => {
    if (isBootstrapping || !showBrand || reduceMotion === null) return;

    const exit = Animated.timing(gateOpacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : TOKENS.motion.duration.fast,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    exit.start(({ finished }) => {
      if (finished) setShowBrand(false);
    });
    return () => exit.stop();
  }, [gateOpacity, isBootstrapping, reduceMotion, showBrand]);

  const handleRetry = useCallback(() => {
    gateOpacity.setValue(1);
    setShowBrand(true);
    retry();
  }, [gateOpacity, retry]);

  if (showBrand) {
    return (
      <Animated.View onLayout={onReady} style={[styles.flexOne, { opacity: gateOpacity }]}>
        <AppScreen edges={[]} style={styles.splashContainer}>
          <View style={styles.splashContent}>
            <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
              <MindFlipLogoMark size={72} />
            </Animated.View>
            <Animated.View style={[styles.splashCopy, { opacity: copyOpacity }]}>
              <Text style={[styles.splashTitle, { color: colors.textPrimary }]}>MINDFLIP</Text>
              <Text style={[styles.splashSubtitle, { color: colors.textMuted }]}>
                Learn. Remember. Grow.
              </Text>
            </Animated.View>
          </View>

          <View style={styles.splashFooter}>
            {isBootstrapping ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
        </AppScreen>
      </Animated.View>
    );
  }

  if (status === "error") {
    return (
      <AppScreen style={styles.splashContainer}>
        <ErrorState
          title="Can't connect to MindFlip"
          message={error || "Check your connection and try again."}
          onRetry={handleRetry}
          retryLabel="Try again"
        />
      </AppScreen>
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
  const nativeSplashHidden = useRef(false);

  useEffect(() => {
    void ensureStorageReady().then(() => {
      discardLegacyPendingProgress();
      setStorageReady(true);
    });
  }, []);

  const handleBootstrapReady = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    void SplashScreen.hideAsync();
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={mobileQueryClient}>
          <CelebrationProvider>
            <AuthenticatedServices />
            <BootstrapGate onReady={handleBootstrapReady} />
            <UpgradeLimitModal />
          </CelebrationProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: TOKENS.spacing.xl,
  },
  splashContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: TOKENS.spacing.md,
  },
  splashTitle: {
    fontSize: TOKENS.typography.screenTitle.fontSize,
    fontWeight: TOKENS.typography.screenTitle.fontWeight,
    letterSpacing: 2,
  },
  splashCopy: {
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    marginTop: TOKENS.spacing.sm,
  },
  splashSubtitle: {
    fontSize: TOKENS.typography.secondaryBody.fontSize,
    fontWeight: TOKENS.typography.label.fontWeight,
  },
  splashFooter: {
    position: "absolute",
    bottom: TOKENS.spacing.xxl,
    left: 0,
    right: 0,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
});
