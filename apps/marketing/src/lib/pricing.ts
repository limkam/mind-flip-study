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
  premium_30: 'Our highest-capacity plan with faster processing and regeneration included.',
};

export const planPrices: Record<MarketingPlanSlug, string> = {
  free: '$0',
  quick_72: '$3.99',
  standard_15: '$6.99',
  premium_30: '$8.99',
};

export const planAnnualPrices: Record<MarketingPlanSlug, string> = {
  free: '$0',
  quick_72: '$24',
  standard_15: '$42',
  premium_30: '$54',
};

export const planHighlights: Record<MarketingPlanSlug, string[]> = {
  free: ['2 chapters each month', 'Unlimited review', 'No card required', 'Your cards stay yours'],
  quick_72: ['2 books / month', '5 flashcard sets / month', '3 games', 'Unlimited daily review'],
  standard_15: ['5 books / month', '10 flashcard sets / month', 'Challenges included', 'Create + run study groups'],
  premium_30: ['10 books / month', '20 flashcard sets / month', 'Priority processing', 'Regeneration included'],
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
      free: 'Join only',
      quick_72: 'Join only',
      standard_15: 'Create + run',
      premium_30: 'Create + run',
    },
  },
  {
    label: 'Regenerate',
    values: { free: 'Not included', quick_72: 'Not included', standard_15: 'Extra credit', premium_30: 'Included' },
  },
  {
    label: 'Daily Review',
    values: {
      free: '20 cards/day',
      quick_72: 'Unlimited',
      standard_15: 'Unlimited',
      premium_30: 'Unlimited',
    },
  },
] as const;
