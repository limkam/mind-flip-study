import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TextInput, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { api } from "../../api/client";
import {
  AppBadge,
  AppButton,
  AppProgressBar,
  AppScreen,
  ScreenHeader,
} from "../../components/ui";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticError, hapticSelection, hapticSuccess } from "../../lib/haptics";
import { type User, useAuthStore } from "../../store/authStore";
import { TOKENS } from "../../theme/tokens";

import axios from "axios";

const CODE_LENGTH = 6;

function OTPCodeInput({
  value,
  onChangeText,
  disabled,
}: {
  value: string;
  onChangeText: (val: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <View style={styles.otpWrap}>
      <View style={styles.otpCellsRow}>
        {cells.map((char, i) => {
          const active = isFocused && i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.otpCell,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: active ? colors.primary : colors.border,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <Text style={[styles.otpCellText, { color: colors.textPrimary }]}>{char}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={CODE_LENGTH}
        editable={!disabled}
        caretHidden
        accessibilityLabel="Verification code"
        style={styles.otpHiddenInput}
      />
    </View>
  );
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; challengeId?: string; resendAfter?: string; dateOfBirth?: string }>();
  const { colors } = useTheme();
  const setAuth = useAuthStore((state) => state.setAuth);
  const keepSignedIn = useAuthStore((state) => state.keepSignedIn);

  const email = params.email || "";
  const [challengeId, setChallengeId] = useState(params.challengeId || "");
  const [code, setCode] = useState("");
  const initialCooldown = Number(params.resendAfter || 60);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [cooldownTotal, setCooldownTotal] = useState(initialCooldown);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const reduceMotion = useReducedMotion();
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.6)).current;

  const submitLockRef = useState(() => ({ current: false }))[0];
  const resendLockRef = useState(() => ({ current: false }))[0];
  const lastSubmittedCodeRef = useState(() => ({ current: "" }))[0];
  const activeChallengeIdRef = useState(() => ({ current: params.challengeId || "" }))[0];
  const isMountedRef = useState(() => ({ current: true }))[0];
  const successTimeoutRef = useState<{ current: ReturnType<typeof setTimeout> | null }>(() => ({ current: null }))[0];

  useEffect(() => {
    activeChallengeIdRef.current = challengeId;
  }, [challengeId, activeChallengeIdRef]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, [isMountedRef, successTimeoutRef]);

  const showSuccessThenNavigate = (user: User) => {
    setVerified(true);
    const duration = reduceMotion ? 80 : TOKENS.motion.duration.celebration;
    Animated.parallel([
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: reduceMotion ? 80 : TOKENS.motion.duration.standard,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: TOKENS.motion.spring.standard.damping,
        stiffness: TOKENS.motion.spring.standard.stiffness,
      }),
    ]).start();

    successTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      router.replace(user.onboarding_completed === false ? "/onboarding" : "/(tabs)");
    }, duration);
  };

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
        date_of_birth: params.dateOfBirth || null,
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
      showSuccessThenNavigate(data.user);
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
      setCooldownTotal(data.resend_after || 60);
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

        <View style={[styles.panel, { backgroundColor: colors.surfaceMuted }]}>
          {verified ? (
            <View style={styles.successWrap}>
              <Animated.View
                style={[
                  styles.successCheck,
                  {
                    backgroundColor: colors.successSurface,
                    opacity: checkOpacity,
                    transform: [{ scale: checkScale }],
                  },
                ]}
              >
                <Ionicons name="checkmark" size={32} color={colors.success} />
              </Animated.View>
              <Text style={[styles.successText, { color: colors.textPrimary }]}>Verified</Text>
            </View>
          ) : (
            <>
              {errorMsg ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[styles.messageBanner, { backgroundColor: colors.dangerSurface }]}
                >
                  <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
                  <Text style={[styles.bannerText, { color: colors.danger }]}>{errorMsg}</Text>
                </View>
              ) : infoMsg ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[styles.messageBanner, { backgroundColor: colors.successSurface }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                  <Text style={[styles.bannerText, { color: colors.success }]}>{infoMsg}</Text>
                </View>
              ) : null}

              <OTPCodeInput value={code} onChangeText={handleCodeChange} disabled={busy} />

              <AppButton
                label="Verify and continue"
                variant="primary"
                size="lg"
                fullWidth
                loading={busy}
                disabled={busy || code.length !== 6}
                onPress={() => void verifyCode(code)}
              />

              <View style={styles.resendGroup}>
                {cooldown > 0 ? (
                  <AppProgressBar
                    progress={cooldownTotal > 0 ? cooldown / cooldownTotal : 0}
                    height={3}
                    color={colors.primary}
                    accessibilityLabel={`Resend available in ${cooldown} seconds`}
                    style={styles.cooldownBar}
                  />
                ) : null}

                <View style={styles.actionRow}>
                  <AppButton
                    label="Resend code"
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
              </View>
            </>
          )}
        </View>
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
  panel: {
    width: "100%",
    borderRadius: TOKENS.radii.xl,
    padding: TOKENS.spacing.lg,
    gap: TOKENS.spacing.md,
  },
  messageBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radii.md,
  },
  bannerText: {
    flex: 1,
    fontSize: TOKENS.typography.caption.fontSize,
    lineHeight: TOKENS.typography.caption.lineHeight,
    fontWeight: TOKENS.typography.bodyEmphasis.fontWeight,
  },
  otpWrap: {
    position: "relative",
  },
  otpCellsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  otpCell: {
    width: 44,
    height: 56,
    borderRadius: TOKENS.radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  otpCellText: {
    fontSize: 22,
    fontWeight: "700",
  },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  resendGroup: {
    gap: TOKENS.spacing.sm,
  },
  cooldownBar: {
    marginTop: TOKENS.spacing.xs,
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: TOKENS.spacing.lg,
  },
  successCheck: {
    width: 64,
    height: 64,
    borderRadius: TOKENS.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: TOKENS.spacing.md,
  },
  successText: {
    fontSize: TOKENS.typography.sectionTitle.fontSize,
    fontWeight: TOKENS.typography.sectionTitle.fontWeight,
  },
  actionRow: {
    alignItems: "center",
    gap: TOKENS.spacing.xs,
  },
});
