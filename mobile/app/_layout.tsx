import "react-native-gesture-handler";
import "react-native-reanimated";

import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { api, setNavigationRouteBridge } from "../api/client";

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

import { BilkeysLogoMark } from "../components/brand/BilkeysBrand";
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
  const { isDark, colors, navigationTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuthStore((state) => state.user?.id);
  const accessToken = useAuthStore((state) => state.accessToken);
  const bootstrapStatus = useAuthStore((state) => state.bootstrapStatus);
  const activityReady = useRef(false);

  useEffect(() => {
    setNavigationRouteBridge(pathname);
    if (bootstrapStatus === "authenticated" && accessToken && activityReady.current) {
      const platform = Platform.OS === "ios" ? "ios" : "android";
      void api.post("/activity/meaningful", { activity_key: "navigation", platform }).catch(() => undefined);
    }
    activityReady.current = bootstrapStatus === "authenticated" && Boolean(accessToken);
  }, [accessToken, bootstrapStatus, pathname]);

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
    <NavigationThemeProvider value={navigationTheme}>
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
        <Stack.Screen name="daily-review" options={{ headerShown: false }} />
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
    </NavigationThemeProvider>
  );
}

function BrandPulse({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.35))).current;

  useEffect(() => {
    if (reduceMotion) {
      dots.forEach((dot) => dot.setValue(0.6));
      return;
    }
    const loops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots, reduceMotion]);

  return (
    <View style={styles.pulseRow} accessibilityElementsHidden accessibilityLabel="Loading">
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[styles.pulseDot, { backgroundColor: color, opacity: dot }]} />
      ))}
    </View>
  );
}

/**
 * How long the branded gate stays on screen once the native splash has actually
 * been dismissed. Without a floor the gate can finish its entrance and exit while
 * still hidden behind the native splash, so the wordmark is never seen.
 */
const BRAND_GATE_MIN_VISIBLE_MS = 1000;

type BootstrapGateProps = {
  onReady: () => void;
  /** True once `SplashScreen.hideAsync()` has resolved and the gate is really visible. */
  nativeSplashHidden: boolean;
};

function BootstrapGate({ onReady, nativeSplashHidden }: BootstrapGateProps) {
  useAuthBootstrap();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.bootstrapStatus);
  const error = useAuthStore((state) => state.bootstrapError);
  const retry = useAuthStore((state) => state.retryAuthBootstrap);
  const [showBrand, setShowBrand] = useState(true);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [entranceDone, setEntranceDone] = useState(false);
  const [minVisibleElapsed, setMinVisibleElapsed] = useState(false);
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.92)).current;
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
    if (reduceMotion === null || !showBrand || !nativeSplashHidden) return;

    markOpacity.setValue(0);
    markScale.setValue(reduceMotion ? 1 : 0.92);
    copyOpacity.setValue(0);
    gateOpacity.setValue(1);
    setEntranceDone(false);
    setMinVisibleElapsed(false);

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
      Animated.timing(copyOpacity, {
        toValue: 1,
        duration: reduceMotion ? 80 : 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    entrance.start(({ finished }) => {
      if (finished) setEntranceDone(true);
    });

    const hold = setTimeout(() => setMinVisibleElapsed(true), BRAND_GATE_MIN_VISIBLE_MS);

    return () => {
      entrance.stop();
      clearTimeout(hold);
    };
  }, [
    copyOpacity,
    gateOpacity,
    markOpacity,
    markScale,
    nativeSplashHidden,
    reduceMotion,
    showBrand,
  ]);

  useEffect(() => {
    if (isBootstrapping || !showBrand || reduceMotion === null) return;
    if (!entranceDone || !minVisibleElapsed) return;

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
  }, [entranceDone, gateOpacity, isBootstrapping, minVisibleElapsed, reduceMotion, showBrand]);

  const handleRetry = useCallback(() => {
    gateOpacity.setValue(1);
    setEntranceDone(false);
    setMinVisibleElapsed(false);
    setShowBrand(true);
    retry();
  }, [gateOpacity, retry]);

  if (showBrand) {
    return (
      <Animated.View onLayout={onReady} style={[styles.flexOne, { opacity: gateOpacity }]}>
        <AppScreen edges={[]} style={styles.splashContainer}>
          <View style={styles.splashContent}>
            <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
              {/* Matches `expo-splash-screen`'s imageWidth in app.json so the mark does not
                  jump size when the native splash hands over to this gate. */}
              <BilkeysLogoMark size={144} />
            </Animated.View>
            <Animated.View style={[styles.splashCopy, { opacity: copyOpacity }]}>
              <Text style={[styles.splashTitle, { color: colors.textPrimary }]}>BILKEYS</Text>
              <Text style={[styles.splashSubtitle, { color: colors.textMuted }]}>
                Study smarter, remember more.
              </Text>
            </Animated.View>
          </View>

          <View style={styles.splashFooter}>
            {isBootstrapping ? <BrandPulse color={colors.primary} reduceMotion={!!reduceMotion} /> : null}
          </View>
        </AppScreen>
      </Animated.View>
    );
  }

  if (status === "error") {
    return (
      <AppScreen style={styles.splashContainer}>
        <ErrorState
          title="Can't connect to Bilkeys"
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
  const [splashHidden, setSplashHidden] = useState(false);
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
    // The brand gate only starts animating once this resolves, otherwise its
    // entrance and exit play out underneath the native splash.
    void SplashScreen.hideAsync().finally(() => setSplashHidden(true));
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
            <BootstrapGate onReady={handleBootstrapReady} nativeSplashHidden={splashHidden} />
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
    // Without this the container shrink-wraps to the mark's width and the
    // absolutely-positioned copy below it wraps mid-word.
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  splashTitle: {
    fontSize: TOKENS.typography.heroDisplay.fontSize,
    fontWeight: TOKENS.typography.heroDisplay.fontWeight,
    letterSpacing: 2,
  },
  splashCopy: {
    // Floated out of flow so the mark stays on the exact screen centre the native
    // splash uses — otherwise the copy pushes the mark up and the two ghost apart
    // during the hand-off.
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: 96,
    alignItems: "center",
    gap: TOKENS.spacing.sm,
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
  pulseRow: {
    flexDirection: "row",
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
