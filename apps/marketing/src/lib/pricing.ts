export const planOrder = ['free', 'quick_72', 'standard_15', 'premium_30'] as const;

export type MarketingPlanSlug = (typeof planOrder)[number];

export const recommendedPlanSlug: MarketingPlanSlug = 'standard_15';

export const planLabels: Record<MarketingPlanSlug, string> = {
  free: 'Free',
  quick_72: 'Quick 7',
  standard_15: 'Standard 15',
  premium_30: 'Premium 30',
};

export const planTaglines: Record<MarketingPlanSlug, string> = {
  free: 'Two chapters a month, forever, plus unlimited review of your existing cards.',
  quick_72: 'A compact monthly plan for light coursework and weekly revision.',
  standard_15: 'The best balance of volume, collaboration, and exam-ready practice.',
  premium_30: 'Our highest-capacity plan with the fastest processing and highest limits.',
};

export const planPrices: Record<MarketingPlanSlug, string> = {
  free: '$0',
  quick_72: '$4.99',
  standard_15: '$7.99',
  premium_30: '$9.99',
};

export const planAnnualPrices: Record<MarketingPlanSlug, string> = {
  free: '$0',
  quick_72: '$39',
  standard_15: '$58',
  premium_30: '$63',
};

export const planAnnualMonthlyPrices: Record<MarketingPlanSlug, string> = Object.fromEntries(
  planOrder.map((slug) => [slug, `$${(Number.parseFloat(planAnnualPrices[slug].slice(1)) / 12).toFixed(2)}`]),
) as Record<MarketingPlanSlug, string>;

export const planHighlights: Record<MarketingPlanSlug, string[]> = {
  free: ['2 chapters each month', 'Unlimited review', 'No card required', 'Your cards stay yours'],
  quick_72: ['2 books / month', '5 flashcard sets / month', '3 games', 'Unlimited daily review'],
  standard_15: ['5 books / month', '10 flashcard sets / month', 'Challenges included', 'Create + run study groups'],
  premium_30: ['10 books / month', '20 flashcard sets / month', 'Priority processing', 'Challenges included'],
};

export const comparisonRows = [
  {
    label: 'Books / month',
    values: { free: '1 (one-time)', quick_72: '2', standard_15: '5', premium_30: '10' },
  },
  {
    label: 'Flashcard sets / month',
    values: { free: '1 (one-time)', quick_72: '5', standard_15: '10', premium_30: '20' },
  },
  {
    label: 'Cards per set (up to)',
    values: { free: '5', quick_72: '20', standard_15: '30', premium_30: '50' },
  },
  {
    label: 'Games',
    values: { free: '2', quick_72: '3', standard_15: '5', premium_30: '8' },
  },
  {
    label: 'Summary + 5 scenarios',
    values: { free: '✓', quick_72: '✓', standard_15: '✓', premium_30: '✓' },
  },
  {
    label: 'Challenges',
    values: { free: 'Not included', quick_72: 'Not included', standard_15: '✓', premium_30: '✓' },
  },
  {
    label: 'Study groups',
    values: {
      free: 'Join 1',
      quick_72: 'Join only',
      standard_15: 'Create + run',
      premium_30: 'Create + run',
    },
  },
  {
    label: 'Regenerate',
    values: { free: 'Not included', quick_72: 'Not included', standard_15: 'Extra credit', premium_30: 'Extra credit' },
  },
  {
    label: 'Daily Review',
    values: {
      free: '5 cards/day',
      quick_72: 'Unlimited',
      standard_15: 'Unlimited',
      premium_30: 'Unlimited',
    },
  },
] as const;
