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
import { displayChapterHeading } from "../../lib/studySetDisplay";

export type TocChapter = {
  chapter_number?: number;
  title: string;
  subtopics?: string[];
  start_offset?: number;
  end_offset?: number;
};

function normalizeChapters(raw: TocChapter[]): TocChapter[] {
  return (raw || []).map((ch, i) => {
    const chapter: TocChapter = {
      chapter_number: ch.chapter_number ?? i + 1,
      title: ch.title || "",
      subtopics: ch.subtopics || [],
    };
    if (typeof ch.start_offset === "number" && typeof ch.end_offset === "number") {
      chapter.start_offset = ch.start_offset;
      chapter.end_offset = ch.end_offset;
    }
    return chapter;
  });
}

function hasCoverage(chapters: TocChapter[]): boolean {
  return (
    chapters.length > 0 &&
    chapters.every((ch) => typeof ch.start_offset === "number" && typeof ch.end_offset === "number")
  );
}

/**
 * Recompute contiguous start/end offsets from each chapter's existing span
 * (end - start), in the current array order. Every edit (reorder, merge,
 * split, delete) preserves the sum of spans, so this keeps the chapters
 * covering the whole book with no gaps after any edit.
 */
function reflow(chapters: TocChapter[]): TocChapter[] {
  if (!hasCoverage(chapters)) return chapters;
  let cursor = 0;
  return chapters.map((ch) => {
    const span = Math.max(0, (ch.end_offset as number) - (ch.start_offset as number));
    const start_offset = cursor;
    const end_offset = cursor + span;
    cursor = end_offset;
    return { ...ch, start_offset, end_offset };
  });
}

function coverageLabel(ch: TocChapter, totalLength?: number): string | null {
  if (!totalLength || typeof ch.start_offset !== "number" || typeof ch.end_offset !== "number") return null;
  const from = Math.round((ch.start_offset / totalLength) * 100);
  const to = Math.round((ch.end_offset / totalLength) * 100);
  return `${from}%–${to}%`;
}

type Props = {
  bookId: string;
  chapters: TocChapter[];
  totalLength?: number;
  onSaved?: () => void;
};

export function TocEditor({ bookId, chapters: initial, totalLength, onSaved }: Props) {
  const { colors } = useTheme();
  const [chapters, setChapters] = useState(() => normalizeChapters(initial));
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (next: TocChapter[]) => {
    const renumbered = next.map((ch, i) => ({ ...ch, chapter_number: i + 1 }));
    setChapters(reflow(renumbered));
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
    const next = [...chapters];
    const removed = next[idx];
    // A deleted chapter's span must be absorbed by a neighbor, or the book
    // would no longer be fully covered by the remaining chapters.
    if (typeof removed.start_offset === "number" && typeof removed.end_offset === "number") {
      const span = removed.end_offset - removed.start_offset;
      const neighborIdx = idx < next.length - 1 ? idx + 1 : idx - 1;
      const neighbor = next[neighborIdx];
      if (neighbor && typeof neighbor.start_offset === "number" && typeof neighbor.end_offset === "number") {
        next[neighborIdx] =
          neighborIdx === idx + 1
            ? { ...neighbor, start_offset: neighbor.start_offset - span }
            : { ...neighbor, end_offset: neighbor.end_offset + span };
      }
    }
    next.splice(idx, 1);
    update(next);
  };

  const mergeWithNext = (idx: number) => {
    if (idx >= chapters.length - 1) return;
    const a = chapters[idx];
    const b = chapters[idx + 1];
    const merged: TocChapter = { ...a, title: `${a.title} / ${b.title}` };
    if (typeof a.start_offset === "number" && typeof b.end_offset === "number") {
      merged.start_offset = a.start_offset;
      merged.end_offset = b.end_offset;
    }
    const next = [...chapters];
    next[idx] = merged;
    next.splice(idx + 1, 1);
    update(next);
  };

  const splitChapter = (idx: number) => {
    const ch = chapters[idx];
    const title = ch.title;
    let parts = title.split(/\s*\/\s*|\s+and\s+/i).filter(Boolean);
    if (parts.length < 2) {
      const half = Math.ceil(title.length / 2);
      parts = [title.slice(0, half).trim() || "Part 1", title.slice(half).trim() || "Part 2"];
    }
    const hasSpan = typeof ch.start_offset === "number" && typeof ch.end_offset === "number";
    const totalChars = parts.reduce((sum, p) => sum + p.length, 0) || 1;
    let cursor = hasSpan ? (ch.start_offset as number) : 0;
    const pieces: TocChapter[] = parts.map((t, i) => {
      const piece: TocChapter = { chapter_number: 0, title: t.trim(), subtopics: [] };
      if (hasSpan) {
        const end = ch.end_offset as number;
        const remaining = end - cursor;
        const weight =
          i === parts.length - 1 ? remaining : Math.round((t.length / totalChars) * (end - (ch.start_offset as number)));
        piece.start_offset = cursor;
        piece.end_offset = cursor + Math.min(weight, remaining);
        cursor = piece.end_offset;
      }
      return piece;
    });
    const next = [...chapters];
    next.splice(idx, 1, ...pieces);
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
          ...(typeof ch.start_offset === "number"
            ? { start_offset: ch.start_offset, end_offset: ch.end_offset }
            : {}),
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

  const covered = hasCoverage(chapters);

  return (
    <View>
      <Text style={[styles.coverageNote, { color: covered ? "#16a34a" : colors.muted }]}>
        {covered
          ? "✓ These chapters cover the entire book, with no gaps."
          : "Chapter boundaries aren't tracked for this book yet — re-extract the table of contents to enable coverage tracking."}
      </Text>
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
          {editingIdx === idx ? (
            <View style={styles.editRow}>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                autoFocus
              />
              <Pressable onPress={commitEdit} style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.iconBtnText, { color: colors.onPrimary }]}>✓</Text>
              </Pressable>
              <Pressable onPress={() => setEditingIdx(null)} style={[styles.iconBtn, { backgroundColor: colors.border }]}>
                <Text style={[styles.iconBtnText, { color: colors.text }]}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.titleCol}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {displayChapterHeading(ch.title, idx + 1)}
              </Text>
              {covered && !!totalLength && (
                <Text style={[styles.coverageLabel, { color: colors.muted }]}>
                  {coverageLabel(ch, totalLength)}
                </Text>
              )}
            </View>
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

      {dirty && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save TOC</Text>
            )}
          </Pressable>
        </View>
      )}
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
  coverageNote: { fontSize: 12, marginBottom: 8 },
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
  titleCol: { flex: 1 },
  title: { fontSize: 14, fontWeight: "600" },
  coverageLabel: { fontSize: 11, marginTop: 2 },
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
  iconBtnText: { fontWeight: "700", fontSize: 14 },
  actions: { flexDirection: "row", gap: 4 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: "center",
  },
  saveBtnText: { fontWeight: "700" },
});
