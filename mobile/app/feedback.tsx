import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SelectField } from "../components/SelectField";
import { PageHeader } from "../components/PageHeader";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useScreenHeader } from "../hooks/useScreenHeader";
import { useTheme } from "../hooks/useTheme";
import { getApiErrorMessage } from "../lib/apiErrors";
import { hapticImpact } from "../lib/haptics";

const CATEGORIES = ["General", "Bug Report", "Feature Request", "Account", "Billing", "Other"];

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const header = useScreenHeader("Feedback");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      Alert.alert("Message required", "Enter your feedback before submitting.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/feedback", {
        content: content.trim(),
        category: category || null,
      });
      setContent("");
      setCategory("");
      Alert.alert("Thank you", "Your feedback was submitted. Our team will review it.");
    } catch (e: unknown) {
      Alert.alert("Could not submit", getApiErrorMessage(e, "Please try again later."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Feedback"
          subtitle="Share suggestions, report issues, or tell us how we can improve MindFlip."
        />

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SelectField
            label="Category (optional)"
            value={category}
            options={CATEGORIES}
            onChange={setCategory}
            placeholder="Select a category"
          />

          <Text style={[styles.label, { color: colors.text }]}>Your message *</Text>
          <TextInput
            style={[
              styles.textarea,
              { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
            ]}
            value={content}
            onChangeText={setContent}
            placeholder="Describe your feedback in detail…"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={5000}
          />
          <Text style={[styles.counter, { color: colors.muted }]}>{content.length}/5000</Text>

          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonDisabled]}
            onPress={() => {
              void hapticImpact("light");
              void submit();
            }}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit feedback</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  label: { fontSize: 14, fontWeight: "600" },
  textarea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 140,
  },
  counter: { fontSize: 12, textAlign: "right" },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
