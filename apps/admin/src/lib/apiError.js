/**
 * Turn FastAPI `detail` (string, array of validation errors, or object) into display text.
 */
export function formatApiError(detail, fallback = 'Request failed') {
  if (detail == null || detail === '') return fallback;
  if (typeof detail === 'string') return detail;
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
  if (typeof detail === 'object' && typeof detail.msg === 'string') {
    return detail.msg;
  }
  return fallback;
}

export function getApiErrorMessage(err, fallback = 'Request failed') {
  return formatApiError(err?.response?.data?.detail, err?.message || fallback);
}
