import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [quantity, setQuantity] = useState<string>("5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: pricingData, isLoading: isPricingLoading, isError: isPricingError, refetch } = useQuery({
    queryKey: ["credit-pricing"],
    queryFn: fetchCreditPricing,
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  if (!visible) return null;

  const isStrictDigits = /^[0-9]+$/.test(quantity.trim());
  const parsedQuantity = isStrictDigits ? parseInt(quantity.trim(), 10) : NaN;
  const minQty = pricingData?.pricing.minimum_quantity || 1;
  const unitPriceCents = pricingData?.pricing.unit_price_cents || 80;
  const currencyStr = (pricingData?.pricing.currency || "usd").toUpperCase();

  const isValidQuantity =
    isStrictDigits &&
    !Number.isNaN(parsedQuantity) &&
    Number.isInteger(parsedQuantity) &&
    parsedQuantity >= minQty &&
    parsedQuantity <= 10000;

  const totalCents = isValidQuantity ? unitPriceCents * parsedQuantity : 0;
  const formatCurrency = (cents: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyStr }).format(cents / 100);
    } catch {
      return `$${(cents / 100).toFixed(2)}`;
    }
  };

  const formattedTotal = formatCurrency(totalCents);
  const formattedUnitPrice = formatCurrency(unitPriceCents);

  const handleQuantityChange = (text: string) => {
    // Strictly accept digit-only text
    const cleaned = text.replace(/[^0-9]/g, "");
    setQuantity(cleaned);
    setErrorMessage(null);
  };

  const handleIncrement = () => {
    const current = Number.isNaN(parsedQuantity) ? 0 : parsedQuantity;
    if (current < 10000) {
      setQuantity(String(current + 1));
      setErrorMessage(null);
    }
  };

  const handleDecrement = () => {
    const current = Number.isNaN(parsedQuantity) ? minQty : parsedQuantity;
    if (current > minQty) {
      setQuantity(String(current - 1));
      setErrorMessage(null);
    }
  };

  const handleSubmit = async () => {
    if (!isValidQuantity || !user?.id || isSubmitting) return;

    const attempt = claimCheckoutAttempt("credit_purchase", user.id, { quantity: parsedQuantity });
    if (!attempt) {
      setErrorMessage("Another checkout attempt is already in progress.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await startCreditCheckout(parsedQuantity, user.id);
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
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
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
          ) : isPricingError ? (
            <View style={[styles.errorBox, { backgroundColor: `${colors.danger}15`, borderColor: colors.danger }]}>
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>Could not load credit pricing catalog.</Text>
              <Pressable style={styles.retryButton} onPress={() => void refetch()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <View style={styles.pricingRow}>
                <Text style={[styles.pricingLabel, { color: colors.muted }]}>Unit Price:</Text>
                <Text style={[styles.pricingValue, { color: colors.text }]}>
                  {formattedUnitPrice} / credit ({currencyStr})
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantity (1 – 10,000)</Text>

              <View style={styles.stepperRow}>
                <Pressable
                  style={[
                    styles.stepperButton,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    (parsedQuantity <= minQty || isSubmitting) && styles.disabledStepper,
                  ]}
                  onPress={handleDecrement}
                  disabled={parsedQuantity <= minQty || isSubmitting}
                >
                  <Ionicons name="remove" size={18} color={parsedQuantity <= minQty ? colors.muted : colors.text} />
                </Pressable>

                <TextInput
                  style={[
                    styles.quantityInput,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                    !isValidQuantity && { borderColor: colors.danger },
                  ]}
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={handleQuantityChange}
                  editable={!isSubmitting}
                />

                <Pressable
                  style={[
                    styles.stepperButton,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    (parsedQuantity >= 10000 || isSubmitting) && styles.disabledStepper,
                  ]}
                  onPress={handleIncrement}
                  disabled={parsedQuantity >= 10000 || isSubmitting}
                >
                  <Ionicons name="add" size={18} color={parsedQuantity >= 10000 ? colors.muted : colors.text} />
                </Pressable>
              </View>

              {!isValidQuantity && quantity.length > 0 && (
                <Text style={[styles.fieldError, { color: colors.danger }]}>
                  Please enter a valid integer quantity between {minQty} and 10,000.
                </Text>
              )}

              <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.muted }]}>Total Due:</Text>
                <Text style={[styles.totalAmount, { color: colors.primary }]}>{formattedTotal}</Text>
              </View>

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
                    (!isValidQuantity || isSubmitting) && styles.disabledSubmit,
                  ]}
                  onPress={handleSubmit}
                  disabled={!isValidQuantity || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitText}>Checkout {formattedTotal}</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pricingLabel: {
    fontSize: 13,
  },
  pricingValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledStepper: {
    opacity: 0.4,
  },
  quantityInput: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  fieldError: {
    fontSize: 12,
    marginTop: -4,
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
