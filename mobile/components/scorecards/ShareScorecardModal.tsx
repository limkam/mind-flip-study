import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { mobileFeatures } from "../../lib/featureFlags";
import {
  createScorecardShare,
  validatePublicDisplayName,
  validateScorecardShareUrl,
  type ParsedScorecardsResponse,
} from "../../lib/scorecards";
import { useAuthStore } from "../../store/authStore";
import type {
  ScorecardOut,
  ScorecardShareExpiryDays,
  ShareCreateIn,
  ShareOut,
} from "../../types/api";

type ShareScorecardModalProps = {
  visible: boolean;
  scorecard: ScorecardOut | null;
  onClose: () => void;
};

const EXPIRY_OPTIONS: Array<{ key: ScorecardShareExpiryDays; label: string }> = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
];

export function ShareScorecardModal({
  visible,
  scorecard,
  onClose,
}: ShareScorecardModalProps) {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [expiresInDays, setExpiresInDays] =
    useState<ScorecardShareExpiryDays>(30);
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [publicDisplayName, setPublicDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareOut | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isCreatingRef = useRef(false);
  const attemptIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    attemptIdRef.current++;
    isCreatingRef.current = false;
    setIsCreating(false);
    setError(null);
    setShareState(null);
    setActionNotice(null);
    setExpiresInDays(30);
    setShowDisplayName(false);
    setPublicDisplayName(user?.full_name || "");
  }, [scorecard?.id, visible, user?.full_name]);

  const nameValidation = validatePublicDisplayName(
    publicDisplayName,
    showDisplayName,
  );

  const handleCreateShare = async () => {
    if (!scorecard || isCreatingRef.current) return;

    if (!mobileFeatures.scorecards) {
      setError("Scorecards are not currently available.");
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (!authUser?.id) {
      setError("Authentication required to create a share link.");
      return;
    }

    const cachedResponse =
      queryClient.getQueryData<ParsedScorecardsResponse>(["scorecards"]);
    const currentCard = cachedResponse?.scorecards.find(
      (c) => c.id === scorecard.id,
    );
    if (!currentCard) {
      setError("This scorecard is no longer available.");
      return;
    }

    if (
      currentCard.period_type !== "weekly" &&
      currentCard.period_type !== "monthly" &&
      currentCard.period_type !== "course"
    ) {
      setError("This scorecard is not eligible for public sharing.");
      return;
    }

    if (!nameValidation.valid) {
      setError(nameValidation.message);
      return;
    }

    const currentAttemptId = ++attemptIdRef.current;
    const capturedUserId = authUser.id;
    const capturedScorecardId = currentCard.id;

    isCreatingRef.current = true;
    setIsCreating(true);
    setError(null);
    setActionNotice(null);

    try {
      const payload: ShareCreateIn = {
        expires_in_days: expiresInDays,
        show_display_name: showDisplayName,
        public_display_name: showDisplayName ? nameValidation.value : null,
      };

      const result = await createScorecardShare(capturedScorecardId, payload);

      if (!mountedRef.current || attemptIdRef.current !== currentAttemptId) {
        return;
      }

      const activeAuthUser = useAuthStore.getState().user;
      if (activeAuthUser?.id !== capturedUserId) {
        return;
      }

      setShareState(result);
    } catch (err: unknown) {
      if (!mountedRef.current || attemptIdRef.current !== currentAttemptId) {
        return;
      }

      let errorMsg =
        "Unable to create the public link. Check your connection and try again.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;

        if (status === 404) {
          errorMsg = "This scorecard cannot be shared right now.";
        } else if (status === 409) {
          errorMsg = "This scorecard is not eligible for public sharing.";
        } else if (status === 422) {
          errorMsg =
            typeof detail === "string"
              ? detail
              : "Invalid sharing options provided.";
        } else if (status === 429) {
          errorMsg = "Too many share attempts. Please try again later.";
        } else if (typeof detail === "string") {
          errorMsg = detail;
        }
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      setError(errorMsg);
    } finally {
      if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
        isCreatingRef.current = false;
        setIsCreating(false);
      }
    }
  };

  const handleShareLink = async () => {
    if (!shareState?.share_url) return;
    try {
      const validUrl = validateScorecardShareUrl(shareState.share_url);
      await Share.share({
        message: validUrl,
        url: validUrl,
      });
    } catch {
      // Non-destructive cancellation
    }
  };

  const handleCopyLink = async () => {
    if (!shareState?.share_url) return;
    try {
      const validUrl = validateScorecardShareUrl(shareState.share_url);
      await Clipboard.setStringAsync(validUrl);
      setActionNotice("Link copied");
    } catch {
      setError("Could not copy link to clipboard.");
    }
  };

  const handleOpenLink = async () => {
    if (!shareState?.share_url) return;
    try {
      const validUrl = validateScorecardShareUrl(shareState.share_url);
      const canOpen = await Linking.canOpenURL(validUrl);
      if (canOpen) {
        await Linking.openURL(validUrl);
      } else {
        setError("Cannot open the public link on this device.");
      }
    } catch {
      setError("Failed to open public share link.");
    }
  };

  const formatExpiryDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const handleDismiss = () => {
    if (isCreating) return;
    attemptIdRef.current++;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View
          style={[styles.modalCard, { backgroundColor: colors.surface }]}
          accessibilityRole="header"
        >
          <View style={styles.headerRow}>
            <View style={styles.titleContainer}>
              <Text style={[styles.title, { color: colors.text }]}>
                {shareState ? "Public link created" : "Create Public Link"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Anyone with the link can view this scorecard until it expires.
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              disabled={isCreating}
              style={[styles.closeButton, { opacity: isCreating ? 0.4 : 1 }]}
              accessibilityLabel="Close share modal"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: `${colors.danger}15`,
                    borderColor: `${colors.danger}40`,
                  },
                ]}
                accessibilityRole="alert"
              >
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  {error}
                </Text>
              </View>
            )}

            {actionNotice && (
              <View
                style={[
                  styles.noticeBanner,
                  {
                    backgroundColor: `${colors.success}15`,
                    borderColor: `${colors.success}40`,
                  },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={colors.success}
                />
                <Text style={[styles.noticeText, { color: colors.success }]}>
                  {actionNotice}
                </Text>
              </View>
            )}

            {!shareState ? (
              <View style={styles.formContainer}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  Link expires after
                </Text>
                <View style={styles.expiryRow}>
                  {EXPIRY_OPTIONS.map((opt) => {
                    const selected = expiresInDays === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setExpiresInDays(opt.key)}
                        disabled={isCreating}
                        style={[
                          styles.expiryChip,
                          {
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                            backgroundColor: selected
                              ? `${colors.primary}15`
                              : colors.background,
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Expires after ${opt.label}`}
                      >
                        <Text
                          style={[
                            styles.expiryChipText,
                            {
                              color: selected ? colors.primary : colors.muted,
                              fontWeight: selected ? "700" : "500",
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.fieldHint, { color: colors.muted }]}>
                  Link expires after {expiresInDays} days
                </Text>

                <View
                  style={[
                    styles.toggleRow,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <View style={styles.toggleTextContainer}>
                    <Text style={[styles.toggleLabel, { color: colors.text }]}>
                      Show my public display name
                    </Text>
                    <Text
                      style={[styles.toggleSublabel, { color: colors.muted }]}
                    >
                      Display your name on the public scorecard
                    </Text>
                  </View>
                  <Switch
                    value={showDisplayName}
                    onValueChange={setShowDisplayName}
                    disabled={isCreating}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    accessibilityLabel="Show my public display name"
                  />
                </View>

                {showDisplayName && (
                  <View style={styles.inputSection}>
                    <View style={styles.inputHeaderRow}>
                      <Text
                        style={[styles.fieldLabel, { color: colors.text }]}
                      >
                        Public display name
                      </Text>
                      <Text
                        style={[
                          styles.charCounter,
                          {
                            color:
                              publicDisplayName.length > 80
                                ? colors.danger
                                : colors.muted,
                          },
                        ]}
                      >
                        {publicDisplayName.length} / 80
                      </Text>
                    </View>
                    <TextInput
                      value={publicDisplayName}
                      onChangeText={setPublicDisplayName}
                      placeholder="Enter a public name or alias"
                      placeholderTextColor={colors.muted}
                      maxLength={80}
                      editable={!isCreating}
                      style={[
                        styles.textInput,
                        {
                          color: colors.text,
                          borderColor: !nameValidation.valid
                            ? colors.danger
                            : colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                      accessibilityLabel="Public display name"
                    />
                    {!nameValidation.valid && (
                      <Text
                        style={[
                          styles.validationError,
                          { color: colors.danger },
                        ]}
                      >
                        {nameValidation.message}
                      </Text>
                    )}
                  </View>
                )}

                <Pressable
                  onPress={handleCreateShare}
                  disabled={
                    isCreating || (showDisplayName && !nameValidation.valid)
                  }
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: colors.primary,
                      opacity:
                        isCreating ||
                        (showDisplayName && !nameValidation.valid) ||
                        pressed
                          ? 0.6
                          : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Create public share link"
                >
                  {isCreating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="link-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>
                        Create Public Link
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.createdContainer}>
                <View
                  style={[
                    styles.shareUrlBox,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.shareUrlText, { color: colors.text }]}
                    selectable
                    numberOfLines={2}
                  >
                    {shareState.share_url}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaBadge}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={colors.muted}
                    />
                    <Text style={[styles.metaText, { color: colors.muted }]}>
                      Expires {formatExpiryDate(shareState.expires_at)}
                    </Text>
                  </View>

                  <View style={styles.metaBadge}>
                    <Ionicons
                      name={
                        shareState.show_display_name
                          ? "eye-outline"
                          : "eye-off-outline"
                      }
                      size={14}
                      color={colors.muted}
                    />
                    <Text style={[styles.metaText, { color: colors.muted }]}>
                      {shareState.show_display_name
                        ? "Display name visible"
                        : "Display name hidden"}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtonsRow}>
                  <Pressable
                    onPress={handleShareLink}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: colors.primary,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Share link via system share sheet"
                  >
                    <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.actionButtonTextPrimary}>
                      Share Link
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleCopyLink}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderWidth: 1,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Copy link to clipboard"
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>
                      Copy Link
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={handleOpenLink}
                  style={({ pressed }) => [
                    styles.openButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open public link in browser"
                >
                  <Text style={[styles.openButtonText, { color: colors.primary }]}>
                    Open link in external browser
                  </Text>
                  <Ionicons
                    name="open-outline"
                    size={16}
                    color={colors.primary}
                  />
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  formContainer: {
    gap: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  expiryRow: {
    flexDirection: "row",
    gap: 8,
  },
  expiryChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  expiryChipText: {
    fontSize: 14,
  },
  fieldHint: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
    marginTop: 4,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  toggleSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  inputSection: {
    gap: 6,
    marginTop: 4,
  },
  inputHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  charCounter: {
    fontSize: 12,
  },
  textInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  validationError: {
    fontSize: 12,
    fontWeight: "500",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  createdContainer: {
    gap: 16,
  },
  shareUrlBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  shareUrlText: {
    fontSize: 14,
    fontFamily: "monospace",
  },
  metaRow: {
    flexDirection: "column",
    gap: 8,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: 12,
  },
  actionButtonTextPrimary: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
