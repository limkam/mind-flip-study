import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_ATTRIBUTION } from '../lib/analyticsDefaults';

export default function AttributionDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/attribution', ['owner-console-attribution']);

  const d = { ...EMPTY_ATTRIBUTION, ...data };

  const funnelColumns = [
    { key: 'channel', label: 'Channel' },
    { key: 'signups', label: 'Signups' },
    { key: 'activated', label: 'Activated' },
    { key: 'activation_pct', label: 'Activation %', render: (row) => `${row.activation_pct}%` },
    { key: 'paying', label: 'Paying' },
    { key: 'paying_pct', label: 'Paying %', render: (row) => `${row.paying_pct}%` },
  ];
  const funnelRows = (d.funnel_by_channel || []).map((r, i) => ({ id: `${r.channel}-${i}`, ...r }));

  const costColumns = [
    { key: 'channel', label: 'Channel' },
    { key: 'paying_subscribers', label: 'Paying Subscribers' },
    {
      key: 'cost_per_paying_subscriber_usd',
      label: 'Cost / Paying Subscriber',
      render: (row) => (row.cost_per_paying_subscriber_usd == null ? 'n/a' : `$${row.cost_per_paying_subscriber_usd.toFixed(2)}`),
    },
  ];
  const costRows = (d.cost_per_channel || []).map((r, i) => ({ id: `${r.channel}-${i}`, ...r }));

  const campaignColumns = [
    { key: 'campaign', label: 'Campaign (utm_campaign)' },
    { key: 'signups', label: 'Signups' },
    { key: 'paying', label: 'Paying' },
    { key: 'conversion_pct', label: 'Conversion %', render: (row) => `${row.conversion_pct}%` },
  ];
  const campaignRows = (d.campaign_performance || []).map((r, i) => ({ id: `${r.campaign}-${i}`, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Attribution" />
        <MetricsSkeleton count={3} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Attribution"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <h3 className="section-title">Signups → Activated → Paying by Channel (last {d.funnel_window_days} days)</h3>
      {funnelRows.length === 0 ? (
        <EmptyState message="No signups in the attribution window yet." />
      ) : (
        <DataTable columns={funnelColumns} rows={funnelRows} />
      )}

      <h3 className="section-title">Cost per Paying Subscriber by Channel</h3>
      <p className="admin-note">{d.cost_note}</p>
      {costRows.length === 0 ? (
        <EmptyState message="No channel data yet." />
      ) : (
        <DataTable columns={costColumns} rows={costRows} />
      )}

      <h3 className="section-title">Content/Campaign Performance by Attributed Signups</h3>
      {campaignRows.length === 0 ? (
        <EmptyState message="No campaign-tagged signups yet." />
      ) : (
        <DataTable columns={campaignColumns} rows={campaignRows} />
      )}
    </div>
  );
}
