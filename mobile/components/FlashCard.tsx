import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";

import { useTheme } from "../hooks/useTheme";
import { hapticImpact } from "../lib/haptics";
import { TOKENS } from "../theme/tokens";
import { StackCard } from "./ui/StackCard";

type Props = {
  front: string;
  back: string;
  difficulty?: string | null;
  chapter?: string | null;
  onFlippedChange?: (flipped: boolean) => void;
};

const RTL_STRONG = /[\u0590-\u08ff\ufb1d-\ufefc]/;
const LTR_STRONG = /[A-Za-z\u00c0-\u02af\u0370-\u052f\u0900-\u1fff\u2e80-\u9fff]/;

const CARD_MIN_HEIGHT = 320;
const CARD_MAX_HEIGHT = 520;
/** Space above the card reserved for the two peeking stack edges. */
const STACK_PEEK = 14;
/** Height of the brand-tinted edge running along the top of the card. */
const BRAND_EDGE_HEIGHT = 5;
/** Distance the revealed content rises as it fades in. */
const REVEAL_RISE = 6;

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
  const { colors, gradients } = useTheme();
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [cardHeight, setCardHeight] = useState(CARD_MIN_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    onFlippedChange?.(true);
    void hapticImpact("light");
  }, [onFlippedChange, revealed]);

  const onCardLayout = useCallback((event: LayoutChangeEvent) => {
    setCardHeight(event.nativeEvent.layout.height);
  }, []);

  const difficultyColor = difficulty === "easy"
    ? colors.success
    : difficulty === "hard"
      ? colors.danger
      : colors.warning;
  const content = revealed ? back : front;

  // 220ms fade paired with a 6px rise — the standard motion band.
  const entering = reduceMotion
    ? undefined
    : FadeInDown
      .duration(TOKENS.motion.duration.standard)
      .withInitialValues({ opacity: 0, transform: [{ translateY: REVEAL_RISE }] });
  const exiting = reduceMotion ? undefined : FadeOut.duration(TOKENS.motion.duration.micro);

  return (
    <StackCard
      width="100%"
      height={cardHeight}
      radius={TOKENS.radii.xl}
      peekTop={STACK_PEEK}
    >
      <View
        onLayout={onCardLayout}
        style={[
          styles.card,
          TOKENS.elevation.floating,
          { backgroundColor: revealed ? colors.cardBack : colors.cardFront },
        ]}
        accessibilityLabel={revealed ? `Answer. ${back}` : `Question. ${front}`}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.brandEdge}
          pointerEvents="none"
        />

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Animated.Text
              key={revealed ? "eyebrow-answer" : "eyebrow-question"}
              entering={entering}
              exiting={exiting}
              style={[styles.eyebrow, { color: colors.primary }]}
            >
              {revealed ? "ANSWER" : "QUESTION"}
            </Animated.Text>
            {chapter ? (
              <Text style={[styles.chapter, { color: colors.textMuted }]} numberOfLines={1}>
                {chapter}
              </Text>
            ) : null}
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
              entering={entering}
              exiting={exiting}
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
            <Text style={[styles.badge, { color: difficultyColor, borderColor: difficultyColor }]}>
              {difficulty}
            </Text>
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
            <Text style={[styles.ratingHint, { color: colors.textMuted }]}>
              Choose a recall rating below
            </Text>
          )}
        </View>
      </View>
    </StackCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: CARD_MIN_HEIGHT,
    maxHeight: CARD_MAX_HEIGHT,
    borderRadius: TOKENS.radii.xl,
    overflow: "hidden",
  },
  brandEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BRAND_EDGE_HEIGHT,
  },
  body: {
    flex: 1,
    padding: TOKENS.spacing.xl,
    paddingTop: TOKENS.spacing.xl + BRAND_EDGE_HEIGHT,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  eyebrow: { ...TOKENS.typography.eyebrow },
  chapter: { ...TOKENS.typography.caption, flex: 1, textAlign: "right" },
  contentScroll: { flexGrow: 0, marginVertical: TOKENS.spacing.lg },
  content: { flexGrow: 1, minHeight: 180, justifyContent: "center" },
  cardText: { ...TOKENS.typography.cardBody, textAlign: "center" },
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
  ratingHint: {
    ...TOKENS.typography.caption,
    textAlign: "center",
    minHeight: TOKENS.layout.minTouchTarget,
    textAlignVertical: "center",
  },
});
