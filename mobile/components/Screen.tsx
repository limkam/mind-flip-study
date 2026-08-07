import { type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";

import { AppScreen } from "./ui/AppScreen";

type Props = {
  children: ReactNode;
  keyboard?: boolean;
  scrollable?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  keyboard = false,
  scrollable = false,
  edges,
  style,
  contentContainerStyle,
}: Props) {
  return (
    <AppScreen
      keyboard={keyboard}
      scrollable={scrollable}
      edges={edges}
      style={style}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </AppScreen>
  );
}
