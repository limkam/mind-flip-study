import * as Haptics from "expo-haptics";

export type ImpactLevel = "light" | "medium" | "heavy";

const IMPACT_MAP = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

async function safeHaptic(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    /* Haptics unavailable on this device/simulator */
  }
}

export async function hapticImpact(level: ImpactLevel = "light") {
  await safeHaptic(() => Haptics.impactAsync(IMPACT_MAP[level]));
}

export async function hapticSelection() {
  await safeHaptic(() => Haptics.selectionAsync());
}

export async function hapticSuccess() {
  await safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export async function hapticWarning() {
  await safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export async function hapticError() {
  await safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
