import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticImpact } from "../../lib/haptics";

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Enter the email for your account.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (e: unknown) {
      Alert.alert("Request failed", getApiErrorMessage(e, "Could not send reset email."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard style={styles.root}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Forgot password</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          Enter your email and we will send a reset link if an account exists.
        </Text>
        {sent ? (
          <Text style={[styles.success, { color: colors.primary }]}>
            If an account exists for that email, a reset link has been sent.
          </Text>
        ) : (
          <>
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
              ]}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonDisabled]}
              onPress={() => {
                void hapticImpact("light");
                void submit();
              }}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
            </Pressable>
          </>
        )}
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={[styles.link, { color: colors.primary }]}>Back to sign in</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: "center", padding: 24 },
  card: { borderRadius: 16, padding: 20, gap: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 15, lineHeight: 22 },
  success: { fontSize: 15, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkWrap: { paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  link: { textAlign: "center", fontSize: 15 },
});
