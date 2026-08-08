import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { TOKENS } from "../theme/tokens";

type Props = {
  front: string;
  back: string;
  difficulty?: string | null;
  chapter?: string | null;
  onFlippedChange?: (flipped: boolean) => void;
};

const RTL_STRONG = /[\u0590-\u08ff\ufb1d-\ufefc]/;
const LTR_STRONG = /[A-Za-z\u00c0-\u02af\u0370-\u052f\u0900-\u1fff\u2e80-\u9fff]/;

function contentDirection(value: string) {
  for (const character of value) {
    if (RTL_STRONG.test(character)) return "rtl" as const;
    if (LTR_STRONG.test(character)) return "ltr" as const;
  }
  return "auto" as const;
}

export function FlashCard({
  front,
  back,
  difficulty,
  chapter,
  onFlippedChange,
}: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    onFlippedChange?.(true);
    void hapticImpact("light");
  }, [onFlippedChange, revealed]);

  const difficultyColor = difficulty === "easy"
    ? colors.success
    : difficulty === "hard"
      ? colors.danger
      : colors.warning;
  const content = revealed ? back : front;

  return (
      <View
        style={[styles.card, { backgroundColor: revealed ? colors.cardBack : colors.cardFront, borderColor: colors.borderStrong }]}
        accessibilityLabel={revealed ? `Answer. ${back}` : `Question. ${front}`}
      >
        <View style={styles.metaRow}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{revealed ? "ANSWER" : "QUESTION"}</Text>
          {chapter ? <Text style={[styles.chapter, { color: colors.textMuted }]} numberOfLines={1}>{chapter}</Text> : null}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.contentScroll}
          contentContainerStyle={styles.content}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Animated.View
            key={revealed ? "answer" : "question"}
            entering={reduceMotion ? undefined : FadeIn.duration(TOKENS.motion.duration.fast)}
            exiting={reduceMotion ? undefined : FadeOut.duration(TOKENS.motion.duration.fast)}
          >
            <Text
              selectable
              style={[
                styles.cardText,
                { color: colors.text, writingDirection: contentDirection(content) },
              ]}
            >
              {content}
            </Text>
          </Animated.View>
        </ScrollView>

        {!revealed && difficulty ? (
          <Text style={[styles.badge, { color: difficultyColor, borderColor: difficultyColor }]}>{difficulty}</Text>
        ) : null}

        {!revealed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reveal answer"
            onPress={reveal}
            style={({ pressed }) => [
              styles.revealButton,
              { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
            ]}
          >
            <Text style={[styles.revealLabel, { color: colors.onPrimary }]}>Reveal answer</Text>
          </Pressable>
        ) : (
          <Text style={[styles.ratingHint, { color: colors.textMuted }]}>Choose a recall rating below</Text>
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 320,
    maxHeight: 520,
    borderRadius: TOKENS.radii.xl,
    borderWidth: 1,
    padding: TOKENS.spacing.xl,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  eyebrow: { ...TOKENS.typography.caption, letterSpacing: 1.2 },
  chapter: { ...TOKENS.typography.caption, flex: 1, textAlign: "right" },
  contentScroll: { flexGrow: 0, marginVertical: TOKENS.spacing.lg },
  content: { flexGrow: 1, minHeight: 180, justifyContent: "center" },
  cardText: { fontSize: 22, lineHeight: 32, fontWeight: "600", textAlign: "center" },
  badge: {
    alignSelf: "center",
    ...TOKENS.typography.caption,
    textTransform: "capitalize",
    borderWidth: 1,
    borderRadius: TOKENS.radii.pill,
    paddingHorizontal: TOKENS.spacing.md,
    paddingVertical: TOKENS.spacing.xs,
    marginBottom: TOKENS.spacing.sm,
  },
  revealButton: {
    minHeight: TOKENS.layout.minTouchTarget,
    borderRadius: TOKENS.radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: TOKENS.spacing.lg,
  },
  revealLabel: { ...TOKENS.typography.buttonLabel },
  ratingHint: { ...TOKENS.typography.caption, textAlign: "center", minHeight: TOKENS.layout.minTouchTarget, textAlignVertical: "center" },
});
