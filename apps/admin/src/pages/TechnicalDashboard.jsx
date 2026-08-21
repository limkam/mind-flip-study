import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_TECHNICAL } from '../lib/analyticsDefaults';

export default function TechnicalDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/technical', ['owner-console-technical']);

  const d = { ...EMPTY_TECHNICAL, ...data };

  const aiCostColumns = [
    { key: 'provider', label: 'Provider' },
    { key: 'p50_usd', label: 'p50', render: (row) => `$${row.p50_usd.toFixed(4)}` },
    {
      key: 'p95_usd',
      label: `p95 (alert > $${d.ai_cost_alert_threshold_usd})`,
      render: (row) => `$${row.p95_usd.toFixed(4)}${row.p95_alert ? ' ⚠' : ''}`,
    },
    { key: 'max_usd', label: 'Max', render: (row) => `$${row.max_usd.toFixed(4)}` },
  ];
  const aiCostRows = (d.ai_cost_by_provider || []).map((r, i) => ({ id: `${r.provider}-${i}`, ...r }));

  const spendColumns = [
    { key: 'tier', label: 'Tier' },
    { key: 'ai_spend_usd', label: 'AI Spend (30d)', render: (row) => `$${row.ai_spend_usd.toFixed(2)}` },
    { key: 'revenue_usd', label: 'Revenue (MRR)', render: (row) => `$${row.revenue_usd.toFixed(2)}` },
  ];
  const spendRows = (d.ai_spend_vs_revenue || []).map((r, i) => ({ id: `${r.tier}-${i}`, ...r }));

  const conversionColumns = [
    { key: 'status', label: 'Book Status' },
    { key: 'count', label: 'Count' },
    { key: 'pct_of_total', label: '% of Total', render: (row) => `${row.pct_of_total}%` },
  ];
  const conversionRows = (d.conversion_success || []).map((r, i) => ({ id: `${r.status}-${i}`, ...r }));

  const guardrailColumns = [
    { key: 'event_type', label: 'Event Type' },
    { key: 'count_30d', label: 'Count (30d)' },
  ];
  const guardrailRows = (d.guardrail_events || []).map((r, i) => ({ id: `${r.event_type}-${i}`, ...r }));

  const securityColumns = [
    { key: 'event_type', label: 'Event Type' },
    { key: 'count_7d', label: 'Count (7d)' },
  ];
  const securityRows = (d.security_events || []).map((r, i) => ({ id: `${r.event_type}-${i}`, ...r }));

  const ipColumns = [
    { key: 'ip_address', label: 'IP Address' },
    { key: 'account_count', label: 'Accounts Sharing This IP' },
  ];
  const ipRows = (d.duplicate_ip_signals || []).map((r, i) => ({ id: `${r.ip_address}-${i}`, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Technical" />
        <MetricsSkeleton count={4} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Technical"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Error Rate (7d)" value={`${d.operational_health.error_rate_pct}%`} />
        <MetricCard label="Processing Queue Depth" value={d.operational_health.queue_depth} />
        <MetricCard label="Processing Time p50" value={`${d.processing_time.p50_seconds}s`} />
        <MetricCard label="Processing Time p95" value={`${d.processing_time.p95_seconds}s`} />
        <MetricCard label="Active Native Sessions" value={d.revoked_sessions.active_sessions} />
        <MetricCard label="Revoked Sessions (7d)" value={d.revoked_sessions.revoked_7d} />
      </div>
      <p className="admin-note">{d.operational_health.uptime_note}</p>
      <p className="admin-note">{d.crash_free_sessions_note}</p>

      <h3 className="section-title">AI Cost per Conversion by Provider (30d)</h3>
      {aiCostRows.length === 0 ? (
        <EmptyState message="No AI usage in the last 30 days." />
      ) : (
        <DataTable columns={aiCostColumns} rows={aiCostRows} />
      )}

      <h3 className="section-title">AI Spend vs. Revenue — Free vs. Paid Tier</h3>
      <DataTable columns={spendColumns} rows={spendRows} />

      <h3 className="section-title">Infra Spend vs. Revenue</h3>
      <p className="admin-note">{d.infra_spend.note}</p>
      <div className="metrics-grid">
        <MetricCard label="Infra Spend" value={`$${d.infra_spend.infra_spend_usd.toFixed(2)}`} />
        <MetricCard label="Revenue (MRR)" value={`$${d.infra_spend.revenue_usd.toFixed(2)}`} />
      </div>

      <h3 className="section-title">Conversion Success Rate (Book Processing Outcomes)</h3>
      {conversionRows.length === 0 ? (
        <EmptyState message="No books uploaded yet." />
      ) : (
        <DataTable columns={conversionColumns} rows={conversionRows} />
      )}

      <h3 className="section-title">Book-Size Guardrail Events</h3>
      {guardrailRows.length === 0 ? (
        <EmptyState message="No guardrail rejections in the last 30 days." />
      ) : (
        <DataTable columns={guardrailColumns} rows={guardrailRows} />
      )}

      <h3 className="section-title">Failed Logins &amp; Security Events (7d)</h3>
      {securityRows.length === 0 ? (
        <EmptyState message="No security events in the last 7 days." />
      ) : (
        <DataTable columns={securityColumns} rows={securityRows} />
      )}

      <h3 className="section-title">Duplicate Signup IPs (Best-Effort Fraud Signal)</h3>
      <p className="admin-note">
        No device or payment fingerprinting is captured anywhere in this system — this is limited to
        accounts sharing a signup IP address, and there is no bot-signup score model yet.
      </p>
      {ipRows.length === 0 ? (
        <EmptyState message="No duplicate signup IPs detected." />
      ) : (
        <DataTable columns={ipColumns} rows={ipRows} />
      )}
    </div>
  );
}
