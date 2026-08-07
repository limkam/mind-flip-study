import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../../hooks/useTheme";

type Props = {
  children: ReactNode;
  keyboard?: boolean;
  scrollable?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function AppScreen({
  children,
  keyboard = false,
  scrollable = false,
  edges,
  style,
  contentContainerStyle,
}: Props) {
  const { colors } = useTheme();

  let content = children;

  if (scrollable) {
    content = (
      <ScrollView
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  if (keyboard) {
    content = (
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flexOne, { backgroundColor: colors.background }, style]}
    >
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
