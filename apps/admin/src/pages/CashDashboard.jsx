import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_CASH } from '../lib/analyticsDefaults';

export default function CashDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/cash', ['owner-console-cash']);

  const d = { ...EMPTY_CASH, ...data };

  const renewalColumns = [
    { key: 'date', label: 'Renewal Date', render: (row) => (row.date ? new Date(row.date).toLocaleDateString() : '—') },
    { key: 'customer', label: 'Customer' },
    { key: 'plan', label: 'Plan' },
    { key: 'amount_usd', label: 'Amount', render: (row) => `$${row.amount_usd.toFixed(2)}` },
  ];
  const renewalRows = (d.upcoming_renewals || []).map((row, i) => ({ id: `${row.customer}-${i}`, ...row }));

  const dunningColumns = [
    { key: 'stage', label: 'Dunning Stage' },
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'mrr_at_risk_usd', label: 'MRR at Risk', render: (row) => `$${row.mrr_at_risk_usd.toFixed(2)}` },
  ];
  const dunningRows = (d.dunning_pipeline || []).map((row, i) => ({ id: `stage-${row.stage}-${i}`, ...row }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Cash" />
        <MetricsSkeleton count={4} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Cash"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <h3 className="section-title">Cash Waterfall</h3>
      <div className="metrics-grid">
        <MetricCard label="Cash Available" value={`$${d.cash_available.toFixed(2)}`} />
        <MetricCard label="Deferred Revenue" value={`$${d.deferred_revenue.toFixed(2)}`} />
        <MetricCard label="Refund/Dispute Reserve" value={`$${d.refund_dispute_reserve.toFixed(2)}`} />
        <MetricCard label="Tax Reserve" value={`$${d.tax_reserve.toFixed(2)}`} />
        <MetricCard label="Infrastructure Reserve" value={`$${d.infrastructure_reserve.toFixed(2)}`} />
        <MetricCard label="Minimum Cash Buffer" value={`$${d.minimum_cash_buffer.toFixed(2)}`} />
        <MetricCard label="Estimated Spendable Cash" value={`$${d.estimated_spendable_cash.toFixed(2)}`} />
        <MetricCard label="Cash Runway" value={`${d.cash_runway_months.toFixed(1)} mo`} />
      </div>
      {d.assumptions?.length > 0 && (
        <ul className="admin-note">
          {d.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      <h3 className="section-title">Upcoming Renewals (Next 30 Days) — ${d.upcoming_renewals_total_usd.toFixed(2)} total</h3>
      {renewalRows.length === 0 ? (
        <EmptyState message="No renewals due in the next 30 days." />
      ) : (
        <DataTable columns={renewalColumns} rows={renewalRows} />
      )}

      <h3 className="section-title">Dunning Pipeline by Retry Stage</h3>
      {dunningRows.length === 0 ? (
        <EmptyState message="No subscriptions currently in dunning." />
      ) : (
        <DataTable columns={dunningColumns} rows={dunningRows} />
      )}
    </div>
  );
}
