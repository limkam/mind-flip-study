import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "react-native-reanimated";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";
import { fetchCreditPricing, startCreditCheckout } from "../../lib/billing";
import { claimCheckoutAttempt, releaseCheckoutAttempt } from "../../lib/checkoutAttempt";
import { useAuthStore } from "../../store/authStore";

type BuyCreditsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function BuyCreditsModal({ visible, onClose }: BuyCreditsModalProps) {
  const reduceMotion = useReducedMotion();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [selectedCredits, setSelectedCredits] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: pricingData, isLoading: isPricingLoading, isError: isPricingError, refetch } = useQuery({
    queryKey: ["credit-pricing"],
    queryFn: fetchCreditPricing,
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  if (!visible) return null;

  const tiers = pricingData?.pricing.tiers || [];
  const currencyStr = (pricingData?.pricing.currency || "usd").toUpperCase();
  const activeCredits = selectedCredits ?? tiers[0]?.credits ?? null;
  const activeTier = tiers.find((t) => t.credits === activeCredits) || null;

  const formatCurrency = (cents: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyStr }).format(cents / 100);
    } catch {
      return `$${(cents / 100).toFixed(2)}`;
    }
  };

  const formattedTotal = activeTier ? formatCurrency(activeTier.price_cents) : null;

  const handleSubmit = async () => {
    if (!activeTier || !user?.id || isSubmitting) return;

    const attempt = claimCheckoutAttempt("credit_purchase", user.id, { quantity: activeTier.credits });
    if (!attempt) {
      setErrorMessage("Another checkout attempt is already in progress.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await startCreditCheckout(activeTier.credits, user.id);
      onClose();
    } catch (err: unknown) {
      releaseCheckoutAttempt(attempt.attemptId, user.id);
      const msg = err instanceof Error ? err.message : "Failed to initiate credit checkout. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Buy Extra Credits</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close modal">
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Purchased credits are permanent and roll over until used for AI generation and flashcard set creation.
          </Text>

          {isPricingLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>Loading credit pricing...</Text>
            </View>
          ) : isPricingError || tiers.length === 0 ? (
            <View style={[styles.errorBox, { backgroundColor: `${colors.danger}15`, borderColor: colors.danger }]}>
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>Could not load credit pricing catalog.</Text>
              <Pressable style={styles.retryButton} onPress={() => void refetch()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Choose a credit pack</Text>

              <View style={styles.tierGrid}>
                {tiers.map((tier) => {
                  const selected = activeCredits === tier.credits;
                  return (
                    <Pressable
                      key={tier.credits}
                      style={[
                        styles.tierCard,
                        { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.background },
                        selected && { backgroundColor: `${colors.primary}15` },
                      ]}
                      onPress={() => {
                        setSelectedCredits(tier.credits);
                        setErrorMessage(null);
                      }}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.tierCredits, { color: colors.text }]}>{tier.credits} credits</Text>
                      <Text style={[styles.tierPrice, { color: colors.muted }]}>{formatCurrency(tier.price_cents)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {formattedTotal ? (
                <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.muted }]}>Total Due:</Text>
                  <Text style={[styles.totalAmount, { color: colors.primary }]}>{formattedTotal}</Text>
                </View>
              ) : null}

              {errorMessage && (
                <View style={[styles.errorBox, { backgroundColor: `${colors.danger}15`, borderColor: colors.danger }]}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                  onPress={onClose}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.submitButton,
                    { backgroundColor: colors.primary },
                    (!activeTier || isSubmitting) && styles.disabledSubmit,
                  ]}
                  onPress={handleSubmit}
                  disabled={!activeTier || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={[styles.submitText, { color: colors.onPrimary }]}>
                      Checkout {formattedTotal || ""}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  formContainer: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  tierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tierCard: {
    width: "31%",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  tierCredits: {
    fontSize: 14,
    fontWeight: "700",
  },
  tierPrice: {
    fontSize: 12,
    fontWeight: "500",
  },
  totalCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledSubmit: {
    opacity: 0.5,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
