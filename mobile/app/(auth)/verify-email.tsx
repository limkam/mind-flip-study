import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../../api/client";
import { MindFlipBrand } from "../../components/brand/MindFlipBrand";
import { Screen } from "../../components/Screen";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { type User, useAuthStore } from "../../store/authStore";

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!email || !challengeId) router.replace("/(auth)/login");
  }, [challengeId, email, router]);

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      const { setNativeRefreshToken, clearNativeRefreshToken } = await import("../../lib/nativeSession");
      const { data } = await api.post<{ access_token: string; refresh_token?: string; user: User }>("/auth/email/verify", {
        challenge_id: challengeId,
        code,
        remember_me: keepSignedIn,
        client: "mobile",
      });
      if (data.refresh_token) {
        await setNativeRefreshToken(data.refresh_token, { persistent: keepSignedIn });
      } else {
        await clearNativeRefreshToken();
      }
      setAuth(data.user, data.access_token);
      router.replace(data.user.onboarding_completed === false ? "/onboarding" : "/(tabs)");
    } catch (error: unknown) {
      Alert.alert("Code not accepted", getApiErrorMessage(error, "The code is invalid or has expired."));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<{ challenge_id: string; resend_after: number }>("/auth/email/start", { email });
      setChallengeId(data.challenge_id);
      setCooldown(data.resend_after || 60);
      setCode("");
      Alert.alert("New code sent");
    } catch (error: unknown) {
      Alert.alert("Could not resend code", getApiErrorMessage(error, "Please try again shortly."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard style={styles.root}>
      <View style={styles.content}>
        <MindFlipBrand centered style={{ marginBottom: 20 }} />
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name="mail-outline" size={26} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Check your email</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Enter the 6-digit code we sent to your email.</Text>
        <Text style={[styles.email, { color: colors.text }]}>{email}</Text>
        <TextInput
          style={[styles.code, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoFocus
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={colors.muted}
        />
        <Pressable style={[styles.primary, { backgroundColor: colors.primary }, busy && styles.disabled]} disabled={busy || code.length !== 6} onPress={() => void verify()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify and continue</Text>}
        </Pressable>
        <Pressable style={styles.resend} disabled={busy || cooldown > 0} onPress={() => void resend()}>
          <Text style={{ color: cooldown > 0 ? colors.muted : colors.primary }}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: "center", padding: 24 },
  content: { alignItems: "center" },
  icon: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 18, fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 8, fontSize: 14, textAlign: "center", lineHeight: 21 },
  email: { marginTop: 4, fontSize: 14, fontWeight: "600" },
  code: { width: "100%", marginTop: 28, minHeight: 52, borderWidth: 1, borderRadius: 10, textAlign: "center", fontSize: 22, fontWeight: "700", letterSpacing: 8 },
  primary: { width: "100%", minHeight: 48, marginTop: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  resend: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.6 },
});
