import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "../../hooks/useTheme";
import { hapticImpact } from "../../lib/haptics";
import {
  normalizeTagsList,
  validateTagInput,
} from "../../lib/tagUtils";

export type TagEditModalProps = {
  visible: boolean;
  setId: string;
  setTitle: string;
  initialTags: string[];
  saving: boolean;
  onSave: (tags: string[]) => Promise<void>;
  onClose: () => void;
};

export function TagEditModal({
  visible,
  setId,
  setTitle,
  initialTags,
  saving,
  onSave,
  onClose,
}: TagEditModalProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [tags, setTags] = useState<string[]>(() => normalizeTagsList(initialTags));
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTags(normalizeTagsList(initialTags));
      setInput("");
      setError(null);
    }
  }, [visible, setId, initialTags]);

  const handleAddTag = () => {
    setError(null);
    if (!input.trim()) return;

    const res = validateTagInput(input, tags);
    if (!res.valid) {
      setError(res.reason);
      return;
    }

    setTags((prev) => [...prev, res.tag]);
    setInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    void hapticImpact("light");
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
    setError(null);
  };

  const handleClearAll = () => {
    void hapticImpact("medium");
    setTags([]);
    setError(null);
  };

  const handleSave = () => {
    setError(null);
    let finalTags = tags;
    // If there is uncommitted text in the input box, attempt to validate and include it
    if (input.trim()) {
      const res = validateTagInput(input, tags);
      if (!res.valid) {
        setError(res.reason);
        return;
      }
      finalTags = [...tags, res.tag];
    }

    const normalizedFinal = normalizeTagsList(finalTags);
    void onSave(normalizedFinal);
  };

  const hasChanged = (() => {
    const normInitial = normalizeTagsList(initialTags);
    if (normInitial.length !== tags.length) return true;
    return normInitial.some((t, i) => t !== tags[i]);
  })() || input.trim().length > 0;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "none" : "slide"}
      transparent
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdropPressable}
          onPress={() => {
            if (!saving) onClose();
          }}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              Edit tags for &quot;{setTitle}&quot;
            </Text>
            {tags.length > 0 ? (
              <Pressable
                onPress={handleClearAll}
                disabled={saving}
                hitSlop={8}
              >
                <Text style={[styles.clearBtn, { color: colors.danger }]}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: error ? colors.danger : colors.border,
                },
              ]}
              value={input}
              onChangeText={(text) => {
                setInput(text);
                if (error) setError(null);
              }}
              placeholder="Add tag (e.g. biology)..."
              placeholderTextColor={colors.muted}
              editable={!saving}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[
                styles.addBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: !input.trim() || saving ? 0.5 : 1,
                },
              ]}
              onPress={handleAddTag}
              disabled={!input.trim() || saving}
            >
              <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>Add</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <Text style={[styles.hintText, { color: colors.muted }]}>
            {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </Text>

          <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chipContainer}>
            {tags.length === 0 ? (
              <Text style={[styles.emptyTagsText, { color: colors.muted }]}>
                No tags added yet. Type a tag above and press Add.
              </Text>
            ) : (
              tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>#{tag}</Text>
                  <Pressable
                    onPress={() => handleRemoveTag(tag)}
                    disabled={saving}
                    hitSlop={8}
                    style={styles.chipRemoveBtn}
                  >
                    <Text style={[styles.chipRemoveText, { color: colors.muted }]}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: saving || !hasChanged ? 0.5 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={saving || !hasChanged}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    marginRight: 10,
  },
  clearBtn: {
    fontSize: 13,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  textInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontWeight: "600",
    fontSize: 14,
  },
  errorText: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    marginBottom: 10,
  },
  chipScroll: {
    maxHeight: 140,
    marginBottom: 16,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  emptyTagsText: {
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipRemoveBtn: {
    padding: 2,
  },
  chipRemoveText: {
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
