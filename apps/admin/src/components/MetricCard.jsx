export default function MetricCard({ label, value, delta }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {delta != null && (
        <div className={`metric-delta${delta >= 0 ? ' up' : ' down'}`}>
          {delta >= 0 ? '+' : ''}
          {delta}
          %
        </div>
      )}
    </div>
  );
}
