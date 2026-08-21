import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_UNIT_ECONOMICS } from '../lib/analyticsDefaults';

export default function UnitEconomicsDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/unit-economics', ['owner-console-unit-economics']);

  const d = { ...EMPTY_UNIT_ECONOMICS, ...data };

  const marginColumns = [
    { key: 'plan', label: 'Plan' },
    { key: 'paying_users', label: 'Paying Users' },
    { key: 'recognized_revenue_usd', label: 'Recognized Revenue', render: (row) => `$${row.recognized_revenue_usd.toFixed(2)}` },
    { key: 'contribution_margin_usd', label: 'Contribution Margin', render: (row) => `$${row.contribution_margin_usd.toFixed(2)}` },
    {
      key: 'margin_pct',
      label: `Margin % (target ${d.margin_target_pct}%)`,
      render: (row) => `${row.margin_pct}%`,
    },
  ];
  const marginRows = (d.plan_margins || []).map((row, i) => ({ id: `${row.plan}-${i}`, ...row }));

  const channelColumns = [
    { key: 'channel', label: 'Channel' },
    { key: 'paying_users', label: 'Paying Users' },
    { key: 'avg_ltv_usd', label: 'Avg LTV', render: (row) => `$${row.avg_ltv_usd.toFixed(2)}` },
    { key: 'cac_usd', label: 'CAC', render: (row) => (row.cac_usd == null ? 'n/a' : `$${row.cac_usd.toFixed(2)}`) },
    { key: 'ltv_to_cac', label: 'LTV:CAC', render: (row) => (row.ltv_to_cac == null ? 'n/a' : row.ltv_to_cac.toFixed(1)) },
    { key: 'payback_months', label: 'Payback (mo)', render: (row) => (row.payback_months == null ? 'n/a' : row.payback_months.toFixed(1)) },
  ];
  const channelRows = (d.channel_economics || []).map((row, i) => ({ id: `${row.channel}-${i}`, ...row }));

  const assumedColumns = [
    { key: 'metric', label: 'Metric' },
    { key: 'measured_value', label: 'Measured', render: (row) => `${row.measured_value} ${row.unit}` },
    { key: 'assumed_value', label: 'Assumed', render: (row) => (row.assumed_value == null ? 'not set' : `${row.assumed_value} ${row.unit}`) },
  ];
  const assumedRows = (d.assumed_vs_measured || []).map((row, i) => ({ id: `${row.metric}-${i}`, ...row }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Unit Economics" />
        <MetricsSkeleton count={3} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Unit Economics"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <h3 className="section-title">Gross Margin by Plan (vs. {d.margin_target_pct}% Target)</h3>
      {marginRows.length === 0 ? (
        <EmptyState message="No paying users with recognized revenue yet." />
      ) : (
        <DataTable columns={marginColumns} rows={marginRows} />
      )}

      <h3 className="section-title">CAC, LTV:CAC &amp; Payback by Channel</h3>
      <p className="admin-note">{d.cac_note}</p>
      {channelRows.length === 0 ? (
        <EmptyState message="No paying users with acquisition-channel data yet." />
      ) : (
        <DataTable columns={channelColumns} rows={channelRows} />
      )}

      <h3 className="section-title">Assumed vs. Measured</h3>
      <DataTable columns={assumedColumns} rows={assumedRows} />
    </div>
  );
}
