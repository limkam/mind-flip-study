import client from '@/api/client';

/** Set VITE_SUBSCRIPTIONS_ENABLED=true to show upgrade UI (profile + header banner). */
export function subscriptionsEnabled() {
  return import.meta.env.VITE_SUBSCRIPTIONS_ENABLED === 'true';
}

export function isFreeTier(subscriptionTier) {
  return !subscriptionTier || subscriptionTier === 'free';
}

export function subscriptionLabel(subscriptionTier) {
  if (subscriptionTier === 'premium') return 'Premium';
  if (subscriptionTier === 'student') return 'Student';
  return 'Free';
}

/** @param {'basic' | 'premium'} plan */
export async function startCheckout(plan = 'basic') {
  const { data } = await client.post('/billing/checkout', null, { params: { plan } });
  if (!data?.checkout_url) {
    throw new Error('Stripe did not return a checkout URL');
  }
  window.location.href = data.checkout_url;
}

export function isUpgradeRequiredError(err) {
  const detail = err?.response?.data?.detail;
  return detail?.code === 'UPGRADE_REQUIRED';
}

export function getUpgradeRequiredMessage(err, fallback = 'Upgrade to unlock this feature.') {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message;
  }
  return fallback;
}
