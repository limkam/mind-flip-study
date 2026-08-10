export function formatMoney(cents, currency = "usd", locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(Number(cents || 0) / 100);
}

export function formatBillingDate(value, locale) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export function remainingAllowance(used, limit) {
  return limit == null ? null : Math.max(0, Number(limit) - Number(used || 0));
}

export function usagePercentage(used, limit) {
  if (limit == null || Number(limit) <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(used || 0) / Number(limit)) * 100)));
}

export function usageLevel(used, limit) {
  const percentage = usagePercentage(used, limit);
  if (percentage >= 100) return "exhausted";
  if (percentage >= 90) return "critical";
  if (percentage >= 70) return "warning";
  return "normal";
}

export function daysUntil(value) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function annualSavings(monthlyCents, annualCents) {
  return Math.max(0, Number(monthlyCents || 0) * 12 - Number(annualCents || 0));
}
