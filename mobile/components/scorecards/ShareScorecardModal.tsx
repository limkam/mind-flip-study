import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { getApiErrorMessage } from "../../lib/apiErrors";
import { mobileFeatures } from "../../lib/featureFlags";
import {
  createScorecardShare,
  revokeScorecardShare,
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

type ShareLifecyclePhase =
  | "idle"
  | "confirming_revoke"
  | "revoking"
  | "confirming_regenerate"
  | "regenerating"
  | "creating";

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
  const [lifecyclePhase, setLifecyclePhase] =
    useState<ShareLifecyclePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareOut | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  const lifecycleLockRef = useRef(false);
  const attemptIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && mountedRef.current) {
        setNowTick(Date.now());
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    attemptIdRef.current++;
    lifecycleLockRef.current = false;
    setLifecyclePhase("idle");
    setError(null);
    setShareState(null);
    setActionNotice(null);
    setExpiresInDays(30);
    setShowDisplayName(false);
    setPublicDisplayName(user?.full_name || "");
    setNowTick(Date.now());
  }, [scorecard?.id, visible, user?.full_name]);

  const isBusy = lifecyclePhase !== "idle" || lifecycleLockRef.current;
  const isExpired = shareState
    ? Date.parse(shareState.expires_at) <= Date.now()
    : false;

  const nameValidation = validatePublicDisplayName(
    publicDisplayName,
    showDisplayName,
  );

  const handleCreateShare = async () => {
    if (!scorecard || isBusy) return;

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

    lifecycleLockRef.current = true;
    setLifecyclePhase("creating");
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
        if (status === 404) {
          errorMsg = "This scorecard cannot be shared right now.";
        } else if (status === 409) {
          errorMsg = "This scorecard is not eligible for public sharing.";
        } else if (status === 422) {
          errorMsg = "Check the sharing options and try again.";
        } else if (status === 429) {
          errorMsg = "Too many share attempts. Please try again later.";
        } else {
          errorMsg = getApiErrorMessage(err, errorMsg);
        }
      } else {
        errorMsg = getApiErrorMessage(err, errorMsg);
      }

      setError(errorMsg);
    } finally {
      if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
        lifecycleLockRef.current = false;
        setLifecyclePhase("idle");
      }
    }
  };

  const confirmRevokeShare = () => {
    if (!scorecard || !shareState || isBusy) return;

    const currentAttemptId = ++attemptIdRef.current;
    lifecycleLockRef.current = true;
    setLifecyclePhase("confirming_revoke");
    setError(null);
    setActionNotice(null);

    Alert.alert(
      "Revoke public link?",
      "Anyone using this link will no longer be able to view the scorecard.",
      [
        {
          text: "Keep link",
          style: "cancel",
          onPress: () => {
            if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
              lifecycleLockRef.current = false;
              setLifecyclePhase("idle");
            }
          },
        },
        {
          text: "Revoke link",
          style: "destructive",
          onPress: () => {
            void executeRevokeShare(currentAttemptId);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
            lifecycleLockRef.current = false;
            setLifecyclePhase("idle");
          }
        },
      }
    );
  };

  const executeRevokeShare = async (attemptId: number) => {
    if (
      !mountedRef.current ||
      attemptIdRef.current !== attemptId ||
      !scorecard ||
      !shareState
    ) {
      if (mountedRef.current && attemptIdRef.current === attemptId) {
        lifecycleLockRef.current = false;
        setLifecyclePhase("idle");
      }
      return;
    }

    if (!mobileFeatures.scorecards) {
      setError("Scorecards are not currently available.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (!authUser?.id) {
      setError("Authentication required to revoke a share link.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const cachedResponse =
      queryClient.getQueryData<ParsedScorecardsResponse>(["scorecards"]);
    const currentCard = cachedResponse?.scorecards.find(
      (c) => c.id === scorecard.id,
    );
    if (!currentCard) {
      setError("This scorecard is no longer available.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const capturedUserId = authUser.id;
    const capturedScorecardId = currentCard.id;
    const capturedShareId = shareState.id;

    setLifecyclePhase("revoking");

    try {
      await revokeScorecardShare(capturedScorecardId, capturedShareId);

      if (!mountedRef.current || attemptIdRef.current !== attemptId) {
        return;
      }

      const activeAuthUser = useAuthStore.getState().user;
      if (activeAuthUser?.id !== capturedUserId) {
        return;
      }

      setShareState(null);
      setActionNotice("Share link revoked");
    } catch (err: unknown) {
      if (!mountedRef.current || attemptIdRef.current !== attemptId) {
        return;
      }

      let errorMsg = "This share link could not be revoked.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) {
          errorMsg = "This share link could not be revoked.";
        } else if (status === 409) {
          errorMsg = "This share link cannot be changed right now.";
        } else if (status === 422) {
          errorMsg = "The share link information is invalid.";
        } else if (status === 429) {
          errorMsg = "Too many share requests. Please try again later.";
        } else {
          errorMsg = getApiErrorMessage(
            err,
            "Unable to revoke the share link. Check your connection and try again.",
          );
        }
      } else {
        errorMsg = getApiErrorMessage(err, errorMsg);
      }

      setError(errorMsg);
    } finally {
      if (mountedRef.current && attemptIdRef.current === attemptId) {
        lifecycleLockRef.current = false;
        setLifecyclePhase("idle");
      }
    }
  };

  const confirmRegenerateShare = () => {
    if (!scorecard || !shareState || isBusy) return;
    if (!nameValidation.valid) {
      setError(nameValidation.message);
      return;
    }

    const currentAttemptId = ++attemptIdRef.current;
    lifecycleLockRef.current = true;
    setLifecyclePhase("confirming_regenerate");
    setError(null);
    setActionNotice(null);

    Alert.alert(
      "Create a new public link?",
      "The current link will stop working and a replacement link will be created.",
      [
        {
          text: "Keep current link",
          style: "cancel",
          onPress: () => {
            if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
              lifecycleLockRef.current = false;
              setLifecyclePhase("idle");
            }
          },
        },
        {
          text: "Create new link",
          style: "destructive",
          onPress: () => {
            void executeRegenerateShare(currentAttemptId);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (mountedRef.current && attemptIdRef.current === currentAttemptId) {
            lifecycleLockRef.current = false;
            setLifecyclePhase("idle");
          }
        },
      }
    );
  };

  const executeRegenerateShare = async (attemptId: number) => {
    if (
      !mountedRef.current ||
      attemptIdRef.current !== attemptId ||
      !scorecard ||
      !shareState
    ) {
      if (mountedRef.current && attemptIdRef.current === attemptId) {
        lifecycleLockRef.current = false;
        setLifecyclePhase("idle");
      }
      return;
    }

    if (!mobileFeatures.scorecards) {
      setError("Scorecards are not currently available.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const authUser = useAuthStore.getState().user;
    if (!authUser?.id) {
      setError("Authentication required to regenerate a share link.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const cachedResponse =
      queryClient.getQueryData<ParsedScorecardsResponse>(["scorecards"]);
    const currentCard = cachedResponse?.scorecards.find(
      (c) => c.id === scorecard.id,
    );
    if (!currentCard) {
      setError("This scorecard is no longer available.");
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    if (!nameValidation.valid) {
      setError(nameValidation.message);
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    const capturedUserId = authUser.id;
    const capturedScorecardId = currentCard.id;
    const capturedShareId = shareState.id;

    const payload: ShareCreateIn = {
      expires_in_days: expiresInDays,
      show_display_name: showDisplayName,
      public_display_name: showDisplayName ? nameValidation.value : null,
    };

    setLifecyclePhase("regenerating");

    // Step 1: Revoke old share
    try {
      await revokeScorecardShare(capturedScorecardId, capturedShareId);
    } catch (err: unknown) {
      if (!mountedRef.current || attemptIdRef.current !== attemptId) {
        return;
      }

      let errorMsg =
        "The current link could not be revoked, so no replacement was created.";
      errorMsg = getApiErrorMessage(err, errorMsg);
      setError(errorMsg);
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    if (!mountedRef.current || attemptIdRef.current !== attemptId) {
      return;
    }

    // Revoke succeeded! Clear old share state locally immediately
    setShareState(null);

    // Preflight re-check scorecard availability before Step 2
    const recheckedResponse =
      queryClient.getQueryData<ParsedScorecardsResponse>(["scorecards"]);
    const recheckedCard = recheckedResponse?.scorecards.find(
      (c) => c.id === capturedScorecardId,
    );
    if (!recheckedCard) {
      setError(
        "The old share link was revoked, but a new link could not be created because the scorecard is no longer available."
      );
      lifecycleLockRef.current = false;
      setLifecyclePhase("idle");
      return;
    }

    // Step 2: Create replacement share
    try {
      const result = await createScorecardShare(capturedScorecardId, payload);

      if (!mountedRef.current || attemptIdRef.current !== attemptId) {
        return;
      }

      const activeAuthUser = useAuthStore.getState().user;
      if (activeAuthUser?.id !== capturedUserId) {
        return;
      }

      setShareState(result);
      setActionNotice("Share link regenerated");
    } catch (err: unknown) {
      if (!mountedRef.current || attemptIdRef.current !== attemptId) {
        return;
      }

      // Step 1 succeeded, but Step 2 failed! Old share is revoked on backend.
      setError(
        "The old share link was revoked, but a new link could not be created. You can create a new link at any time."
      );
    } finally {
      if (mountedRef.current && attemptIdRef.current === attemptId) {
        lifecycleLockRef.current = false;
        setLifecyclePhase("idle");
      }
    }
  };

  const handleCopyLink = async () => {
    if (!shareState?.share_url || isExpired || isBusy) return;
    try {
      const validUrl = validateScorecardShareUrl(shareState.share_url);
      await Clipboard.setStringAsync(validUrl);
      setActionNotice("Link copied");
    } catch {
      setError("Could not copy link to clipboard.");
    }
  };

  const handleOpenLink = async () => {
    if (!shareState?.share_url || isExpired || isBusy) return;
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
    if (isBusy) return;
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
                {shareState
                  ? isExpired
                    ? "Public link expired"
                    : "Public link active"
                  : "Create Public Link"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Anyone with the link can view this scorecard until it expires.
              </Text>
            </View>
            <Pressable
              onPress={handleDismiss}
              disabled={isBusy}
              style={[styles.closeButton, { opacity: isBusy ? 0.4 : 1 }]}
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

            {/* Form Options Section */}
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
                      disabled={isBusy}
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
                  disabled={isBusy}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  accessibilityLabel="Show my public display name"
                />
              </View>

              {showDisplayName && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>
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
                    editable={!isBusy}
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
            </View>

            {/* Created / Active Share Link Section */}
            {shareState ? (
              <View style={styles.createdContainer}>
                <View
                  style={[
                    styles.shareUrlBox,
                    {
                      backgroundColor: colors.background,
                      borderColor: isExpired ? colors.danger : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.shareUrlText,
                      {
                        color: isExpired ? colors.muted : colors.text,
                        textDecorationLine: isExpired ? "line-through" : "none",
                      },
                    ]}
                    selectable={!isExpired}
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
                      color={isExpired ? colors.danger : colors.muted}
                    />
                    <Text
                      style={[
                        styles.metaText,
                        {
                          color: isExpired ? colors.danger : colors.muted,
                          fontWeight: isExpired ? "600" : "400",
                        },
                      ]}
                    >
                      {isExpired
                        ? "This public link has expired"
                        : `Expires ${formatExpiryDate(shareState.expires_at)}`}
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

                {/* Main Action Buttons */}
                <View style={styles.actionButtonsRow}>
                  <Pressable
                    onPress={handleCopyLink}
                    disabled={isExpired || isBusy}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: colors.primary,
                        opacity: isExpired || isBusy || pressed ? 0.5 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Copy link to clipboard"
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionButtonTextPrimary}>
                      Copy Link
                    </Text>
                  </Pressable>
                </View>

                {/* Revoke and Regenerate Buttons */}
                <View style={styles.actionButtonsRow}>
                  <Pressable
                    onPress={confirmRevokeShare}
                    disabled={isBusy}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: `${colors.danger}12`,
                        borderColor: `${colors.danger}40`,
                        borderWidth: 1,
                        opacity: isBusy || pressed ? 0.6 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Revoke public share link"
                  >
                    {lifecyclePhase === "revoking" ||
                    lifecyclePhase === "confirming_revoke" ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={colors.danger}
                        />
                        <Text
                          style={[
                            styles.actionButtonText,
                            { color: colors.danger },
                          ]}
                        >
                          Revoke Link
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={confirmRegenerateShare}
                    disabled={
                      isBusy || (showDisplayName && !nameValidation.valid)
                    }
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.primary,
                        borderWidth: 1.5,
                        opacity:
                          isBusy ||
                          (showDisplayName && !nameValidation.valid) ||
                          pressed
                            ? 0.5
                            : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate public share link"
                  >
                    {lifecyclePhase === "regenerating" ||
                    lifecyclePhase === "confirming_regenerate" ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="refresh-outline"
                          size={18}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.actionButtonText,
                            { color: colors.primary },
                          ]}
                        >
                          Regenerate Link
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  onPress={handleOpenLink}
                  disabled={isExpired || isBusy}
                  style={({ pressed }) => [
                    styles.openButton,
                    { opacity: isExpired || isBusy || pressed ? 0.4 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open public scorecard"
                >
                  <Text
                    style={[styles.openButtonText, { color: colors.primary }]}
                  >
                    Open public scorecard
                  </Text>
                  <Ionicons
                    name="open-outline"
                    size={16}
                    color={colors.primary}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleCreateShare}
                disabled={
                  isBusy || (showDisplayName && !nameValidation.valid)
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      isBusy ||
                      (showDisplayName && !nameValidation.valid) ||
                      pressed
                        ? 0.6
                        : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create public share link"
              >
                {lifecyclePhase === "creating" ? (
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
    marginBottom: 16,
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
