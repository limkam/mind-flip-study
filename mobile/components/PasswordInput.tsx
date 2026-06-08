import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from "react-native";

import { useTheme } from "../hooks/useTheme";

type Props = TextInputProps & {
  containerStyle?: object;
};

export function PasswordInput({ containerStyle, style, ...props }: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
          style,
        ]}
        placeholderTextColor={colors.muted}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingRight: 44,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
  },
  toggle: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
