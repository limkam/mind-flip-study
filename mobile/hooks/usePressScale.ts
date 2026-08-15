import { useRef } from "react";
import { Animated } from "react-native";

import { TOKENS } from "../theme/tokens";

/** Shared tactile press-feedback: scale toward `scaleTo` on press-in, spring back on release. */
export function usePressScale(scaleTo = 0.98) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(scale, {
      toValue: scaleTo,
      duration: TOKENS.motion.duration.micro,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: TOKENS.motion.duration.micro,
      useNativeDriver: true,
    }).start();
  };

  return { scale, onPressIn, onPressOut };
}
