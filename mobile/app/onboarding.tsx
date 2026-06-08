import { useRouter } from "expo-router";
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

import { DateOfBirthField } from "../components/DateOfBirthField";
import { SelectField } from "../components/SelectField";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { COUNTRIES, getContinentForCountry } from "../lib/countries";
import { getApiErrorMessage } from "../lib/apiErrors";
import { hapticImpact } from "../lib/haptics";
import { type User, useAuthStore } from "../store/authStore";

const OCCUPATIONS = ["Student", "Teacher", "Professional", "Researcher", "Other"];
const TODAY = new Date().toISOString().slice(0, 10);

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { accessToken, setAuth } = useAuthStore();

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [country, setCountry] = useState("");
  const [customCountry, setCustomCountry] = useState("");
  const [occupation, setOccupation] = useState("");
  const [customOccupation, setCustomOccupation] = useState("");
  const [busy, setBusy] = useState(false);

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
  ];

  const submit = async () => {
    if (!dateOfBirth) {
      Alert.alert("Date of birth required", "Select your date of birth.");
      return;
    }
    if (dateOfBirth > TODAY) {
      Alert.alert("Invalid date", "Date of birth cannot be in the future.");
      return;
    }
    if (!country) {
      Alert.alert("Country required", "Select your country.");
      return;
    }
    if (country === "Other" && !customCountry.trim()) {
      Alert.alert("Country name required", "Enter your country name.");
      return;
    }
    const occ = occupation === "Other" ? customOccupation.trim() : occupation;
    if (!occ) {
      Alert.alert("Occupation required", "Select or enter your occupation.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<User>("/auth/onboarding", {
        date_of_birth: dateOfBirth,
        country,
        custom_country: country === "Other" ? customCountry.trim() : null,
        continent: getContinentForCountry(country, customCountry.trim()),
        occupation: occ,
      });
      if (accessToken) setAuth(data, accessToken);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      Alert.alert("Could not save profile", getApiErrorMessage(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Before you get started…</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Help us personalize your experience</Text>

        <View style={styles.form}>
          <DateOfBirthField
            label="Date of birth *"
            value={dateOfBirth}
            onChange={setDateOfBirth}
          />

          <SelectField
            label="Country *"
            value={country}
            options={COUNTRIES}
            onChange={setCountry}
            searchable
          />
          {country === "Other" ? (
            <TextInput
              style={inputStyle}
              value={customCountry}
              onChangeText={setCustomCountry}
              placeholder="Country name *"
              placeholderTextColor={colors.muted}
            />
          ) : null}

          <SelectField
            label="Occupation *"
            value={occupation}
            options={OCCUPATIONS}
            onChange={setOccupation}
          />
          {occupation === "Other" ? (
            <TextInput
              style={inputStyle}
              value={customOccupation}
              onChangeText={setCustomOccupation}
              placeholder="Your occupation"
              placeholderTextColor={colors.muted}
            />
          ) : null}

          <Pressable
            style={[styles.button, { backgroundColor: colors.primary }, busy && styles.buttonDisabled]}
            onPress={() => {
              void hapticImpact("light");
              void submit();
            }}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { fontSize: 15, marginTop: 8, marginBottom: 20 },
  form: { gap: 14 },
  label: { fontSize: 14, fontWeight: "600" },
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
});
