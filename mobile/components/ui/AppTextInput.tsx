import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { TOKENS } from "../../theme/tokens";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  isPassword?: boolean;
  disabled?: boolean;
};

export function AppTextInput({
  label,
  error,
  helperText,
  containerStyle,
  isPassword = false,
  disabled,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  ...props
}: Props) {
  const { colors, isDark } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const showSecureText = isPassword ? !passwordVisible : secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: error ? colors.danger : colors.textPrimary }]}>
          {label}
        </Text>
      ) : null}

      <View style={styles.inputWrapper}>
        <TextInput
          {...props}
          editable={!disabled}
          secureTextEntry={showSecureText}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: isDark ? colors.surface : colors.background,
              color: colors.textPrimary,
              borderColor: error
                ? colors.danger
                : isFocused
                ? colors.primary
                : colors.border,
              paddingRight: isPassword ? 44 : TOKENS.spacing.lg,
              opacity: disabled ? 0.5 : 1,
            },
            style,
          ]}
        />

        {isPassword ? (
          <Pressable
            style={styles.toggleButton}
            onPress={() => setPasswordVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            hitSlop={8}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.helperText, { color: colors.textMuted }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: TOKENS.spacing.md,
  },
  label: {
    fontSize: TOKENS.typography.label.fontSize,
    fontWeight: TOKENS.typography.label.fontWeight,
    marginBottom: TOKENS.spacing.xs,
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    borderWidth: 1,
    borderRadius: TOKENS.radii.md,
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.md,
    fontSize: TOKENS.typography.body.fontSize,
    minHeight: 48, // Minimum touch target size
  },
  toggleButton: {
    position: "absolute",
    right: TOKENS.spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },
  errorText: {
    fontSize: TOKENS.typography.caption.fontSize,
    marginTop: TOKENS.spacing.xs,
  },
  helperText: {
    fontSize: TOKENS.typography.caption.fontSize,
    marginTop: TOKENS.spacing.xs,
  },
});
