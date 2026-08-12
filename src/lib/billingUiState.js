export function billingAccountState({ data, isPending = false, isError = false }) {
  if (isPending) return "loading";
  if (isError || !data) return "error";
  if (data.subscription_status === "subscription_conflict") return "conflict";
  if (data.plan_slug === "free" && data.subscription_status === "free") return "free";
  if (data.plan_slug && data.plan_slug !== "free") return "paid";
  return "unknown";
}

export function subscriptionsFeatureEnabled(value) {
  return String(value ?? "true").trim().toLowerCase() !== "false";
}
