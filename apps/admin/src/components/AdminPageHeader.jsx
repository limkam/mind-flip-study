export default function AdminPageHeader({ title, lastUpdated, onRefresh, isRefreshing }) {
  return (
    <div className="admin-page-header">
      <h2 className="page-title">{title}</h2>
      <div className="admin-page-actions">
        {lastUpdated && (
          <span className="admin-last-updated">
            Last updated:
            {' '}
            {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
        <button
          type="button"
          className="btn-refresh"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
