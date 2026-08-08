import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import { MindFlipLogoMark } from "../../components/brand/MindFlipBrand";
import { AppButton, AppCard, AppScreen, AppTextInput } from "../../components/ui";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticSelection } from "../../lib/haptics";
import { type User, useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";

WebBrowser.maybeCompleteAuthSession();

function isGoogleAuthConfigured(): boolean {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (Platform.OS === "ios") {
    return !!(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || webClientId);
  }
  if (Platform.OS === "android") {
    return !!(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || webClientId);
  }
  return !!webClientId;
}

function postLoginRoute(user: User): "/onboarding" | "/(tabs)" {
  return user.onboarding_completed === false ? "/onboarding" : "/(tabs)";
}

function GoogleSignInButton({
  onError,
}: {
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const platformId = Platform.select({
    ios: iosId || webId,
    android: androidId || webId,
    default: webId,
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: platformId,
    webClientId: webId,
    iosClientId: iosId || webId,
    androidClientId: androidId || webId,
  });
  const [busy, setBusy] = useState(false);
  const lockRef = useState(() => ({ current: false }))[0];

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.authentication?.idToken;
    if (!idToken) {
      onError("Google sign-in couldn't be completed. Please try again.");
      return;
    }
    if (lockRef.current) return;
    lockRef.current = true;
    setBusy(true);

    void (async () => {
      try {
        const { setNativeRefreshToken, clearNativeRefreshToken } = await import("../../lib/nativeSession");
        const attemptKeepSignedIn = useAuthStore.getState().keepSignedIn;
        const { data } = await api.post<{ access_token: string; refresh_token?: string; user: User }>("/auth/google", {
          id_token: idToken,
          remember_me: attemptKeepSignedIn,
          client: "mobile",
        });
        if (data.refresh_token) {
          await setNativeRefreshToken(data.refresh_token, { persistent: attemptKeepSignedIn });
        } else {
          await clearNativeRefreshToken();
        }
        setAuth(data.user, data.access_token);
        router.replace(postLoginRoute(data.user));
      } catch (e: unknown) {
        onError(getApiErrorMessage(e, "Google sign-in failed. Please try again."));
      } finally {
        lockRef.current = false;
        setBusy(false);
      }
    })();
  }, [response, router, setAuth, onError, lockRef]);

  return (
    <AppButton
      label="Continue with Google"
      icon="logo-google"
      variant="secondary"
      size="lg"
      fullWidth
      loading={busy}
      disabled={!request || busy || lockRef.current}
      onPress={() => {
        if (lockRef.current || busy) return;
        void promptAsync();
      }}
    />
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const keepSignedIn = useAuthStore((s) => s.keepSignedIn);
  const setKeepSignedIn = useAuthStore((s) => s.setKeepSignedIn);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const emailSubmitLockRef = useState(() => ({ current: false }))[0];

  const handleToggleKeepSignedIn = () => {
    if (busy || emailSubmitLockRef.current) return;
    void hapticSelection();
    setKeepSignedIn(!keepSignedIn);
  };

  const emailLogin = async () => {
    if (emailSubmitLockRef.current || busy) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailFieldError("Enter a valid email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailFieldError("Enter a valid email address.");
      return;
    }

    emailSubmitLockRef.current = true;
    setEmailFieldError(null);
    setFormError(null);
    setBusy(true);

    try {
      const normalizedEmail = trimmed.toLowerCase();
      const { data } = await api.post<{ challenge_id: string; resend_after: number }>("/auth/email/start", {
        email: normalizedEmail,
      });
      router.push({
        pathname: "/(auth)/verify-email",
        params: { email: normalizedEmail, challengeId: data.challenge_id, resendAfter: String(data.resend_after) },
      });
    } catch (e: unknown) {
      setFormError(getApiErrorMessage(e, "MindFlip is having trouble sending your verification code. Please try again."));
    } finally {
      emailSubmitLockRef.current = false;
      setBusy(false);
    }
  };

  const googleConfigured = isGoogleAuthConfigured();

  return (
    <AppScreen keyboard scrollable style={styles.root} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerStack}>
        <MindFlipLogoMark size={64} style={styles.logoMark} />
        <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>MindFlip</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          Learn smarter. Remember longer.
        </Text>
      </View>

      <AppCard variant="elevated" style={styles.card}>
        {formError ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.errorBanner, { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}30` }]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{formError}</Text>
          </View>
        ) : null}

        {googleConfigured ? (
          <GoogleSignInButton onError={(msg) => setFormError(msg)} />
        ) : (
          <AppButton
            label="Continue with Google"
            icon="logo-google"
            variant="secondary"
            size="lg"
            fullWidth
            disabled
            onPress={() => {}}
          />
        )}

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <AppTextInput
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (emailFieldError) setEmailFieldError(null);
            if (formError) setFormError(null);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          error={emailFieldError || undefined}
          containerStyle={styles.inputContainer}
        />

        <AppButton
          label="Continue with Email"
          icon="mail-outline"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={() => void emailLogin()}
        />

        <Pressable
          onPress={handleToggleKeepSignedIn}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: keepSignedIn, disabled: busy }}
          accessibilityLabel="Keep me signed in"
          disabled={busy}
          style={styles.keepSignedInRow}
          hitSlop={8}
        >
          <Ionicons
            name={keepSignedIn ? "checkbox" : "square-outline"}
            size={22}
            color={keepSignedIn ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.keepSignedInText, { color: colors.textSecondary }]}>
            Keep me signed in
          </Text>
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.xxl,
    justifyContent: "center",
  },
  headerStack: {
    alignItems: "center",
    marginBottom: TOKENS.spacing.xxl,
  },
  logoMark: {
    marginBottom: TOKENS.spacing.md,
  },
  brandTitle: {
    fontSize: TOKENS.typography.display.fontSize,
    fontWeight: TOKENS.typography.display.fontWeight,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: TOKENS.typography.bodyEmphasis.fontSize,
    lineHeight: TOKENS.typography.bodyEmphasis.lineHeight,
    marginTop: TOKENS.spacing.xs,
    textAlign: "center",
  },
  card: {
    gap: TOKENS.spacing.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    marginBottom: TOKENS.spacing.xs,
  },
  errorText: {
    flex: 1,
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    fontWeight: TOKENS.typography.bodyEmphasis.fontWeight,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: TOKENS.spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: TOKENS.spacing.md,
    fontSize: TOKENS.typography.caption.fontSize,
    fontWeight: TOKENS.typography.caption.fontWeight,
  },
  inputContainer: {
    marginBottom: TOKENS.spacing.xs,
  },
  keepSignedInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    paddingVertical: TOKENS.spacing.xs,
    minHeight: TOKENS.layout.minTouchTarget,
    marginTop: TOKENS.spacing.xs,
  },
  keepSignedInText: {
    fontSize: TOKENS.typography.secondaryBody.fontSize,
    fontWeight: TOKENS.typography.label.fontWeight,
  },
});
