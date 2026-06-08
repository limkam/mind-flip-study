export function MetricsSkeleton({ count = 6 }) {
  return (
    <div className="metrics-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="metric-card skeleton-card">
          <div className="skeleton-line skeleton-value" />
          <div className="skeleton-line skeleton-label" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 320 }) {
  return (
    <div className="chart-wrap skeleton-chart" style={{ minHeight: height }} aria-hidden="true">
      <div className="skeleton-line skeleton-chart-bar" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="data-table-wrap skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-line skeleton-table-row" />
      ))}
    </div>
  );
}
