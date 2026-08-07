import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { api } from "../../api/client";
import {
  AppBadge,
  AppButton,
  AppCard,
  AppScreen,
  AppTextInput,
  ScreenHeader,
} from "../../components/ui";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticError, hapticSelection, hapticSuccess } from "../../lib/haptics";
import { type User, useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";

import axios from "axios";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; challengeId?: string; resendAfter?: string }>();
  const { colors } = useTheme();
  const setAuth = useAuthStore((state) => state.setAuth);
  const keepSignedIn = useAuthStore((state) => state.keepSignedIn);

  const email = params.email || "";
  const [challengeId, setChallengeId] = useState(params.challengeId || "");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(Number(params.resendAfter || 60));
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const submitLockRef = useState(() => ({ current: false }))[0];
  const resendLockRef = useState(() => ({ current: false }))[0];
  const lastSubmittedCodeRef = useState(() => ({ current: "" }))[0];
  const activeChallengeIdRef = useState(() => ({ current: params.challengeId || "" }))[0];
  const isMountedRef = useState(() => ({ current: true }))[0];

  useEffect(() => {
    activeChallengeIdRef.current = challengeId;
  }, [challengeId, activeChallengeIdRef]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [isMountedRef]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!email || !challengeId) {
      router.replace("/(auth)/login");
    }
  }, [challengeId, email, router]);

  const verifyCode = async (codeInput: string) => {
    if (!/^\d{6}$/.test(codeInput)) return;
    if (submitLockRef.current || busy) return;
    if (lastSubmittedCodeRef.current === codeInput) return;

    submitLockRef.current = true;
    lastSubmittedCodeRef.current = codeInput;
    const targetChallengeId = challengeId;

    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { setNativeRefreshToken, clearNativeRefreshToken } = await import("../../lib/nativeSession");
      const { data } = await api.post<{ access_token: string; refresh_token?: string; user: User }>("/auth/email/verify", {
        challenge_id: targetChallengeId,
        code: codeInput,
        remember_me: keepSignedIn,
        client: "mobile",
      });

      if (!isMountedRef.current || activeChallengeIdRef.current !== targetChallengeId) {
        return;
      }

      if (data.refresh_token) {
        await setNativeRefreshToken(data.refresh_token, { persistent: keepSignedIn });
      } else {
        await clearNativeRefreshToken();
      }

      void hapticSuccess();
      setAuth(data.user, data.access_token);
      router.replace(data.user.onboarding_completed === false ? "/onboarding" : "/(tabs)");
    } catch (error: unknown) {
      if (!isMountedRef.current || activeChallengeIdRef.current !== targetChallengeId) {
        return;
      }
      lastSubmittedCodeRef.current = "";

      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const isNetworkError = axios.isAxiosError(error) && (error.code === "ERR_NETWORK" || !error.response);

      if (status === 400) {
        void hapticError();
        setErrorMsg("That code isn't valid anymore. Check the code or request a new one.");
      } else if (status === 422) {
        void hapticError();
        setErrorMsg("We couldn't verify that code. Please try again.");
      } else if (status === 429) {
        setErrorMsg("Too many attempts. Please wait before trying again.");
      } else if (isNetworkError) {
        setErrorMsg("You're offline. Check your connection and try again.");
      } else if (status && status >= 500) {
        setErrorMsg("MindFlip is having trouble signing you in right now. Please try again.");
      } else {
        setErrorMsg(getApiErrorMessage(error, "We couldn't verify that code. Please try again."));
      }
    } finally {
      submitLockRef.current = false;
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  };

  const handleCodeChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    if (errorMsg) setErrorMsg(null);
    if (infoMsg) setInfoMsg(null);

    if (cleaned.length === 6 && !busy && !submitLockRef.current) {
      void verifyCode(cleaned);
    }
  };

  const resendCode = async () => {
    if (cooldown > 0 || busy || resendLockRef.current) return;
    resendLockRef.current = true;

    setBusy(true);
    setErrorMsg(null);

    try {
      const { data } = await api.post<{ challenge_id: string; resend_after: number }>("/auth/email/start", { email });
      if (!isMountedRef.current) return;

      void hapticSelection();
      setChallengeId(data.challenge_id);
      setCooldown(data.resend_after || 60);
      setCode("");
      lastSubmittedCodeRef.current = "";
      setInfoMsg("A new verification code has been sent to your email.");
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(getApiErrorMessage(error, "Could not resend code. Please try again shortly."));
    } finally {
      resendLockRef.current = false;
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <AppScreen keyboard scrollable style={styles.root}>
      <ScreenHeader
        title="Verification"
        showBack
        onBack={() => router.replace("/(auth)/login")}
      />

      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name="mail-unread-outline" size={32} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Check your email
        </Text>

        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          We sent a 6-digit verification code to
        </Text>

        <AppBadge
          label={email}
          variant="primary"
          style={styles.emailBadge}
        />

        <AppCard variant="elevated" style={styles.card}>
          {errorMsg ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.messageBanner, { backgroundColor: `${colors.danger}12`, borderColor: `${colors.danger}30` }]}
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
              <Text style={[styles.bannerText, { color: colors.danger }]}>{errorMsg}</Text>
            </View>
          ) : infoMsg ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.messageBanner, { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}30` }]}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={[styles.bannerText, { color: colors.success }]}>{infoMsg}</Text>
            </View>
          ) : null}

          <AppTextInput
            label="Verification Code"
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={6}
            placeholder="000000"
            style={styles.codeInput}
            containerStyle={styles.inputContainer}
          />

          <AppButton
            label="Verify and continue"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy || code.length !== 6}
            onPress={() => void verifyCode(code)}
          />

          <View style={styles.actionRow}>
            <AppButton
              label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              variant="ghost"
              size="sm"
              disabled={busy || cooldown > 0}
              onPress={() => void resendCode()}
            />

            <AppButton
              label="Use a different email"
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() => router.replace("/(auth)/login")}
            />
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: TOKENS.spacing.lg,
    paddingBottom: TOKENS.spacing.xxl,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: TOKENS.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: TOKENS.spacing.lg,
    marginBottom: TOKENS.spacing.md,
  },
  title: {
    fontSize: TOKENS.typography.screenTitle.fontSize,
    fontWeight: TOKENS.typography.screenTitle.fontWeight,
    lineHeight: TOKENS.typography.screenTitle.lineHeight,
    textAlign: "center",
  },
  subtitle: {
    fontSize: TOKENS.typography.secondaryBody.fontSize,
    marginTop: TOKENS.spacing.xs,
    textAlign: "center",
  },
  emailBadge: {
    marginTop: TOKENS.spacing.sm,
    marginBottom: TOKENS.spacing.xl,
  },
  card: {
    width: "100%",
    gap: TOKENS.spacing.md,
  },
  messageBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    fontWeight: TOKENS.typography.bodyEmphasis.fontWeight,
  },
  inputContainer: {
    marginBottom: TOKENS.spacing.xs,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 8,
    minHeight: 56,
  },
  actionRow: {
    alignItems: "center",
    gap: TOKENS.spacing.xs,
    marginTop: TOKENS.spacing.xs,
  },
});
