import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../../api/client";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpact, hapticSuccess } from "../../lib/haptics";

export type TocChapter = {
  chapter_number?: number;
  title: string;
  subtopics?: string[];
};

function normalizeChapters(raw: TocChapter[]): TocChapter[] {
  return (raw || []).map((ch, i) => ({
    chapter_number: ch.chapter_number ?? i + 1,
    title: ch.title || "",
    subtopics: ch.subtopics || [],
  }));
}

type Props = {
  bookId: string;
  chapters: TocChapter[];
  onSaved?: () => void;
};

export function TocEditor({ bookId, chapters: initial, onSaved }: Props) {
  const { colors } = useTheme();
  const [chapters, setChapters] = useState(() => normalizeChapters(initial));
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (next: TocChapter[]) => {
    setChapters(next.map((ch, i) => ({ ...ch, chapter_number: i + 1 })));
    setDirty(true);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditTitle(chapters[idx].title);
  };

  const commitEdit = () => {
    if (editingIdx == null) return;
    const title = editTitle.trim();
    if (!title) return;
    const next = [...chapters];
    next[editingIdx] = { ...next[editingIdx], title };
    update(next);
    setEditingIdx(null);
  };

  const deleteChapter = (idx: number) => {
    if (chapters.length <= 1) {
      Alert.alert("Cannot delete", "At least one chapter is required.");
      return;
    }
    update(chapters.filter((_, i) => i !== idx));
  };

  const addChapter = () => {
    const next = [...chapters, { chapter_number: chapters.length + 1, title: "New Chapter", subtopics: [] }];
    update(next);
    setEditingIdx(chapters.length);
    setEditTitle("New Chapter");
  };

  const mergeWithNext = (idx: number) => {
    if (idx >= chapters.length - 1) return;
    const merged = `${chapters[idx].title} / ${chapters[idx + 1].title}`;
    const next = [...chapters];
    next[idx] = { ...next[idx], title: merged };
    next.splice(idx + 1, 1);
    update(next);
  };

  const splitChapter = (idx: number) => {
    const title = chapters[idx].title;
    let parts = title.split(/\s*\/\s*|\s+and\s+/i).filter(Boolean);
    if (parts.length < 2) {
      const half = Math.ceil(title.length / 2);
      parts = [title.slice(0, half).trim() || "Part 1", title.slice(half).trim() || "Part 2"];
    }
    const next = [...chapters];
    next.splice(
      idx,
      1,
      ...parts.map((t) => ({ chapter_number: 0, title: t.trim(), subtopics: [] as string[] })),
    );
    update(next);
  };

  const moveChapter = (from: number, to: number) => {
    if (to < 0 || to >= chapters.length) return;
    const next = [...chapters];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/books/${bookId}/toc`, {
        chapters: chapters.map((ch) => ({
          chapter_number: ch.chapter_number,
          title: ch.title.trim(),
          subtopics: ch.subtopics || [],
        })),
      });
      setDirty(false);
      void hapticSuccess();
      onSaved?.();
      Alert.alert("Saved", "Table of contents updated.");
    } catch (e: unknown) {
      Alert.alert("Could not save", getApiErrorMessage(e, "Your table of contents couldn't be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      {chapters.map((ch, idx) => (
        <View
          key={`${idx}-${ch.title}`}
          style={[styles.row, { borderColor: colors.border, backgroundColor: colors.background }]}
        >
          <View style={styles.moveCol}>
            <Pressable
              hitSlop={6}
              disabled={idx === 0}
              onPress={() => {
                void hapticImpact("light");
                moveChapter(idx, idx - 1);
              }}
              style={{ opacity: idx === 0 ? 0.3 : 1 }}
            >
              <Text style={{ color: colors.muted, fontSize: 16 }}>↑</Text>
            </Pressable>
            <Pressable
              hitSlop={6}
              disabled={idx >= chapters.length - 1}
              onPress={() => {
                void hapticImpact("light");
                moveChapter(idx, idx + 1);
              }}
              style={{ opacity: idx >= chapters.length - 1 ? 0.3 : 1 }}
            >
              <Text style={{ color: colors.muted, fontSize: 16 }}>↓</Text>
            </Pressable>
          </View>
          <Text style={[styles.num, { color: colors.primary }]}>{idx + 1}</Text>
          {editingIdx === idx ? (
            <View style={styles.editRow}>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                autoFocus
              />
              <Pressable onPress={commitEdit} style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.iconBtnText}>✓</Text>
              </Pressable>
              <Pressable onPress={() => setEditingIdx(null)} style={[styles.iconBtn, { backgroundColor: colors.border }]}>
                <Text style={[styles.iconBtnText, { color: colors.text }]}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {ch.title}
            </Text>
          )}
          {editingIdx !== idx && (
            <View style={styles.actions}>
              <ActionBtn label="✎" onPress={() => startEdit(idx)} colors={colors} />
              <ActionBtn label="⊕" onPress={() => mergeWithNext(idx)} colors={colors} disabled={idx >= chapters.length - 1} />
              <ActionBtn label="⊘" onPress={() => splitChapter(idx)} colors={colors} />
              <ActionBtn label="🗑" onPress={() => deleteChapter(idx)} colors={colors} danger />
            </View>
          )}
        </View>
      ))}

      <View style={styles.footer}>
        <Pressable
          style={[styles.addBtn, { borderColor: colors.border }]}
          onPress={() => {
            void hapticImpact("light");
            addChapter();
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "700" }}>+ Add Chapter</Text>
        </Pressable>
        {dirty && (
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save TOC</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  colors,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  colors: { border: string; surface: string; danger: string };
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      hitSlop={4}
      disabled={disabled}
      onPress={() => {
        void hapticImpact("light");
        onPress();
      }}
      style={[styles.actionBtn, { backgroundColor: danger ? `${colors.danger}18` : colors.surface, opacity: disabled ? 0.35 : 1 }]}
    >
      <Text style={{ fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  moveCol: { alignItems: "center", gap: 2 },
  num: { fontSize: 12, fontWeight: "800", width: 20 },
  title: { flex: 1, fontSize: 14, fontWeight: "600" },
  editRow: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  actions: { flexDirection: "row", gap: 4 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  addBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
