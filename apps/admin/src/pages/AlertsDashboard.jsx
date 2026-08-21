import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_ALERTS } from '../lib/analyticsDefaults';

export default function AlertsDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/alerts', ['owner-console-alerts']);

  const d = { ...EMPTY_ALERTS, ...data };

  const thresholdColumns = [
    { key: 'label', label: 'Metric', render: (row) => `${row.label}${row.placeholder ? ' (placeholder target)' : ''}` },
    { key: 'current_value', label: 'Current', render: (row) => `${row.current_value}${row.unit === '$' ? '' : row.unit}` },
    {
      key: 'threshold',
      label: 'Threshold',
      render: (row) => `${row.comparison === 'gt' ? '>' : '<'} ${row.threshold}${row.unit === '$' ? '' : row.unit}`,
    },
    { key: 'breached', label: 'Status', render: (row) => (row.breached ? '⚠ Breached' : 'OK') },
  ];
  const thresholdRows = (d.thresholds || []).map((r, i) => ({ id: `${r.key}-${i}`, ...r }));

  const breachColumns = [
    { key: 'metric_key', label: 'Metric' },
    { key: 'severity', label: 'Severity' },
    { key: 'message', label: 'Message' },
    { key: 'triggered_at', label: 'Triggered', render: (row) => new Date(row.triggered_at).toLocaleString() },
    { key: 'resolved_at', label: 'Resolved', render: (row) => (row.resolved_at ? new Date(row.resolved_at).toLocaleString() : 'Ongoing') },
  ];
  const breachRows = (d.recent_breaches || []).map((r) => ({ id: r.id, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Alerts" />
        <MetricsSkeleton count={2} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Alerts"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <p className="admin-note">
        Slack delivery mode: <strong>{d.slack_delivery_mode}</strong>. Evaluated every 30 minutes by a
        Celery beat task. Thresholds marked "placeholder target" have no business-set number anywhere
        in this system yet — the value shown is a reasonable default, not a confirmed target.
      </p>

      <h3 className="section-title">Configured Thresholds</h3>
      <DataTable columns={thresholdColumns} rows={thresholdRows} />

      <h3 className="section-title">Recent Breaches</h3>
      {breachRows.length === 0 ? (
        <EmptyState message="No alert breaches recorded yet." />
      ) : (
        <DataTable columns={breachColumns} rows={breachRows} />
      )}
    </div>
  );
}
