export const PLAN_ORDER = ["free", "quick_72", "standard_15", "premium_30"];

export const RECOMMENDED_PLAN_SLUG = "standard_15";

export const PLAN_LABELS = {
  free: "Free",
  quick_72: "Quick 7",
  standard_15: "Standard 15",
  premium_30: "Premium 30",
};

export const PLAN_TAGLINES = {
  free: "Best for trying Bilkeys once and exploring the study flow.",
  quick_72: "For light weekly study and faster AI-powered review.",
  standard_15: "For consistent coursework, exam prep, and active group study.",
  premium_30:
    "For power users who want the highest limits and fastest processing.",
};

export const PLAN_HEADLINES = {
  free: "Start free",
  quick_72: "Light, flexible access",
  standard_15: "Most popular for serious study",
  premium_30: "Maximum speed and coverage",
};

export const PLAN_HIGHLIGHTS = {
  free: [
    "1 book import",
    "1 flashcard set",
    "Up to 5 cards per set",
    "5 daily review cards",
    "Join 1 study group",
  ],
  quick_72: [
    "2 books / month",
    "5 flashcard sets / month",
    "Up to 20 cards per set",
    "Unlimited daily review",
  ],
  standard_15: [
    "5 books / month",
    "10 flashcard sets / month",
    "Challenges included",
    "Create and run study groups",
  ],
  premium_30: [
    "10 books / month",
    "20 flashcard sets / month",
    "Priority processing",
    "Challenges included",
  ],
};

export const PLAN_CTA_LABELS = {
  free: "Included",
  quick_72: "Choose Quick 7",
  standard_15: "Choose Standard 15",
  premium_30: "Choose Premium 30",
};

export const PLAN_COMPARISON_ROWS = [
  {
    label: "Books / month",
    values: {
      free: "1 (one-time)",
      quick_72: "2",
      standard_15: "5",
      premium_30: "10",
    },
  },
  {
    label: "Flashcard sets / month",
    values: {
      free: "1 (one-time)",
      quick_72: "5",
      standard_15: "10",
      premium_30: "20",
    },
  },
  {
    label: "Cards per set (up to)",
    values: {
      free: "5",
      quick_72: "20",
      standard_15: "30",
      premium_30: "50",
    },
  },
  {
    label: "Games",
    values: {
      free: "2",
      quick_72: "3",
      standard_15: "5",
      premium_30: "8",
    },
  },
  {
    label: "Summary + 5 scenarios",
    values: {
      free: "✓",
      quick_72: "✓",
      standard_15: "✓",
      premium_30: "✓",
    },
  },
  {
    label: "Challenges",
    values: {
      free: "—",
      quick_72: "—",
      standard_15: "✓",
      premium_30: "✓",
    },
  },
  {
    label: "Study groups",
    values: {
      free: "Join 1",
      quick_72: "Join only",
      standard_15: "Create + run",
      premium_30: "Create + run",
    },
  },
  {
    label: "Regenerate",
    values: {
      free: "—",
      quick_72: "—",
      standard_15: "Extra credit",
      premium_30: "Extra credit",
    },
  },
  {
    label: "Daily Review",
    values: {
      free: "5 cards/day",
      quick_72: "Unlimited",
      standard_15: "Unlimited",
      premium_30: "Unlimited",
    },
  },
];

export function formatUsd(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export function planLabelFromSlug(slug) {
  return PLAN_LABELS[slug] || PLAN_LABELS.free;
}

export function planSlugFromTier(subscriptionTier) {
  if (subscriptionTier === "premium") return "premium_30";
  if (subscriptionTier === "student") return "standard_15";
  return "free";
}

export function planLabelFromTier(subscriptionTier) {
  return planLabelFromSlug(planSlugFromTier(subscriptionTier));
}

export function checkoutPlanForSlug(slug) {
  if (slug === "quick_72") return "quick";
  if (slug === "premium_30") return "premium";
  return "standard";
}

export function monthlyPriceForPlan(pricing, slug) {
  return pricing?.plans?.[slug]?.monthly_price_cents ?? 0;
}

export function priceForPlan(pricing, slug, interval = "monthly") {
  const plan = pricing?.plans?.[slug];
  return interval === "annual"
    ? (plan?.annual_price_cents ?? 0)
    : (plan?.monthly_price_cents ?? 0);
}

export function monthlyPriceIdForPlan(pricing, slug) {
  return pricing?.plans?.[slug]?.stripe_price_id_monthly ?? null;
}

export function priceIdForPlan(pricing, slug, interval = "monthly") {
  const plan = pricing?.plans?.[slug];
  return interval === "annual"
    ? (plan?.stripe_price_id_annual ?? null)
    : (plan?.stripe_price_id_monthly ?? null);
}
