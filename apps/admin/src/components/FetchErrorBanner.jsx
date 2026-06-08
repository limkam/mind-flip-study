export default function FetchErrorBanner({ message, onRetry, isRetrying }) {
  if (!message) return null;
  return (
    <div className="fetch-error-banner" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}
