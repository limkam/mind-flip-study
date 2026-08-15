import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import { TOKENS } from "../../theme/tokens";

export type SetActionSheetAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  actions: SetActionSheetAction[];
  onClose: () => void;
};

export function SetActionSheet({ visible, title, actions, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close menu"
          accessibilityRole="button"
        />
        <View
          style={[
            styles.sheet,
            TOKENS.elevation.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              paddingBottom: TOKENS.spacing.xl + insets.bottom,
            },
          ]}
        >
          <View style={[styles.grabHandle, { backgroundColor: colors.borderStrong }]} />
          <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>
            {title}
          </Text>

          {actions.map((action) => (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceMuted : "transparent" },
              ]}
              onPress={() => {
                void hapticImpact("light");
                onClose();
                action.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: action.destructive ? colors.dangerSurface : colors.surfaceMuted },
                ]}
              >
                <Ionicons
                  name={action.icon}
                  size={18}
                  color={action.destructive ? colors.danger : colors.text}
                />
              </View>
              <Text
                style={[styles.rowLabel, { color: action.destructive ? colors.danger : colors.text }]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceMuted }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelLabel, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: TOKENS.radii.xl,
    borderTopRightRadius: TOKENS.radii.xl,
    borderWidth: 1,
    paddingTop: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
  },
  grabHandle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: TOKENS.radii.xs,
    marginBottom: TOKENS.spacing.md,
  },
  title: {
    ...TOKENS.typography.label,
    textAlign: "center",
    marginBottom: TOKENS.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
    minHeight: TOKENS.layout.minTouchTarget,
    borderRadius: TOKENS.radii.md,
    paddingHorizontal: TOKENS.spacing.sm,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: TOKENS.radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    ...TOKENS.typography.bodyEmphasis,
  },
  cancelBtn: {
    minHeight: TOKENS.layout.minTouchTarget,
    borderRadius: TOKENS.radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: TOKENS.spacing.sm,
  },
  cancelLabel: {
    ...TOKENS.typography.bodyEmphasis,
  },
});
