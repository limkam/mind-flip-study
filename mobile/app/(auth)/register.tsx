import { Link, useRouter } from "expo-router";
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

import { PasswordInput } from "../../components/PasswordInput";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { hapticImpact } from "../../lib/haptics";

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || !fullName.trim()) {
      Alert.alert("Missing fields", "Enter email, password (8+ chars), and name.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/register", {
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
      });
      Alert.alert("Account created", "You can sign in now.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch (e: unknown) {
      Alert.alert("Register failed", getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
  ];

  return (
    <Screen keyboard style={styles.root}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
        <TextInput
          style={inputStyle}
          placeholder="Full name"
          placeholderTextColor={colors.muted}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <PasswordInput
          placeholder="Password (min 8)"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonDisabled]}
          onPress={() => {
            void hapticImpact("light");
            void submit();
          }}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
        </Pressable>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkWrap}>
            <Text style={[styles.link, { color: colors.primary }]}>Already have an account? Sign in</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: "center", padding: 24 },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
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
    marginTop: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkWrap: { paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  link: { textAlign: "center", fontSize: 15 },
});
