export function isValidCheckoutSessionId(value) {
  return /^cs_[a-zA-Z0-9_]{7,252}$/.test(String(value || ""));
}

export function classifyCheckoutVerification(result, expectedKind) {
  if (!result || result.checkout_kind !== expectedKind) return "error";
  if (expectedKind === "subscription") {
    if (result.subscription_state === "active") return "success";
    if (result.checkout_status === "complete" && result.subscription_state === "processing") return "processing";
    return "error";
  }
  if (result.purchase_state === "credited") return "success";
  if (result.checkout_status === "complete" && result.purchase_state === "processing") return "processing";
  return "error";
}
