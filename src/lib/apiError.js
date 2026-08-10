/**
 * Turn FastAPI `detail` (string, array of validation errors, or object) into display text.
 */
const PLAIN_ENGLISH_MAP = {
  ALREADY_SUBSCRIBED: "You already have an active subscription.",
  SUBSCRIPTION_CONFLICT: "Multiple active subscriptions were found. Please contact support.",
  PAYMENT_FAILED: "Your payment couldn't be processed. Please try another payment method.",
  NO_BILLING_PROFILE: "No billing profile is available for this account.",
  BILLING_UNAVAILABLE: "Billing services are temporarily unavailable.",
  PORTAL_UNAVAILABLE: "Subscription management is temporarily unavailable.",
  CHECKOUT_UNAVAILABLE: "Checkout is temporarily unavailable.",
  TRIAL_NOT_ELIGIBLE: "This account is not eligible for a free trial.",
  NETWORK_ERROR: "Unable to connect. Check your internet connection.",
  SERVER_ERROR: "Something went wrong. Please try again later.",
};

export function formatApiError(detail, fallback = 'Something went wrong. Please try again later.') {
  if (detail == null || detail === '') return fallback;
  if (typeof detail === 'string') {
    if (PLAIN_ENGLISH_MAP[detail]) return PLAIN_ENGLISH_MAP[detail];
    if (detail.includes("Network Error") || detail.includes("Failed to fetch")) {
      return PLAIN_ENGLISH_MAP.NETWORK_ERROR;
    }
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof item.msg === 'string') {
          const loc = Array.isArray(item.loc)
            ? item.loc.filter((p) => p !== 'body').join('.')
            : '';
          return loc ? `${loc}: ${item.msg}` : item.msg;
        }
        return null;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : fallback;
  }
  if (typeof detail === 'object') {
    if (detail.code && PLAIN_ENGLISH_MAP[detail.code]) {
      return PLAIN_ENGLISH_MAP[detail.code];
    }
    if (typeof detail.message === 'string') {
      return detail.message;
    }
    if (typeof detail.msg === 'string') {
      return detail.msg;
    }
  }
  return fallback;
}

export function getApiErrorMessage(err, fallback = 'Something went wrong. Please try again later.') {
  if (!err) return fallback;

  // Handle network / offline errors
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
    return PLAIN_ENGLISH_MAP.NETWORK_ERROR;
  }

  const responseStatus = err?.response?.status;
  const detail = err?.response?.data?.detail;

  if (detail) {
    const formatted = formatApiError(detail, null);
    if (formatted) return formatted;
  }

  if (responseStatus === 409) {
    return PLAIN_ENGLISH_MAP.ALREADY_SUBSCRIBED;
  }
  if (responseStatus === 402) {
    return PLAIN_ENGLISH_MAP.PAYMENT_FAILED;
  }
  if (responseStatus >= 500) {
    return PLAIN_ENGLISH_MAP.SERVER_ERROR;
  }

  return fallback;
}

