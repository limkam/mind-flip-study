import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../hooks/useTheme";
import { formatDateOfBirth } from "../lib/ageUtils";

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  maximumDate?: Date;
};

export function DateOfBirthField({ label, value, onChange, maximumDate = new Date() }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : new Date(2000, 0, 1);

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed" || !date) return;
    onChange(formatDateOfBirth(date));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => setOpen(true)}
      >
        <Text style={{ color: value ? colors.text : colors.muted }}>
          {value || "Select date of birth"}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={selected}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={maximumDate}
          onChange={onPickerChange}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Pressable onPress={() => setOpen(false)} style={styles.done}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  trigger: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  done: { alignSelf: "flex-end", paddingVertical: 8 },
});
