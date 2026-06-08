import { type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../hooks/useTheme";

type Props = {
  children: ReactNode;
  keyboard?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, keyboard = false, edges, style }: Props) {
  const { colors } = useTheme();

  const body = keyboard ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {body}
    </SafeAreaView>
  );
}
