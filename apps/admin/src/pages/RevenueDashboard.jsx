import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminPageHeader from '../components/AdminPageHeader';
import { ChartSkeleton, MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_REVENUE } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

export default function RevenueDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/revenue', ['owner-console-revenue']);

  const d = { ...EMPTY_REVENUE, ...data };
  const movements = d.mrr_movements?.length ? d.mrr_movements : EMPTY_REVENUE.mrr_movements;

  const planMixColumns = [
    { key: 'plan_name', label: 'Plan' },
    { key: 'subscribers', label: 'Subscribers' },
    { key: 'pct_of_total', label: 'Actual %', render: (row) => `${row.pct_of_total}%` },
    {
      key: 'target_pct',
      label: 'Target %',
      render: (row) => (row.target_pct == null ? '—' : `${row.target_pct}%`),
    },
  ];
  const planMixRows = (d.plan_mix || []).map((row, i) => ({ id: `${row.plan_slug}-${i}`, ...row }));

  const intervalColumns = [
    { key: 'interval', label: 'Billing Interval' },
    { key: 'subscribers', label: 'Subscribers' },
    { key: 'pct_of_total', label: '% of Total', render: (row) => `${row.pct_of_total}%` },
  ];
  const intervalRows = (d.billing_interval_mix || []).map((row, i) => ({ id: `${row.interval}-${i}`, ...row }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Revenue" />
        <MetricsSkeleton count={3} />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Revenue"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="MRR" value={`$${d.mrr_usd.toFixed(2)}`} />
        <MetricCard label="ARR" value={`$${d.arr_usd.toFixed(2)}`} />
        <MetricCard
          label="Extra Credit % of MRR"
          value={`${d.extra_credit_pct_of_mrr.toFixed(1)}%`}
          delta={d.extra_credit_alert ? d.extra_credit_pct_of_mrr : null}
        />
      </div>
      {d.extra_credit_alert && (
        <FetchErrorBanner message={`Extra Credit revenue is ${d.extra_credit_pct_of_mrr.toFixed(1)}% of MRR — above the 15% alert threshold.`} />
      )}

      <h3 className="section-title">MRR Movement (New / Expansion / Contraction / Churned)</h3>
      <p className="admin-note">
        Expansion and contraction only reflect plan changes logged since this tracking shipped —
        early months may under-report those two even if real upgrades/downgrades happened.
      </p>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={movements} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
            <Legend />
            <Bar dataKey="new_mrr_usd" name="New" stackId="mrr" fill={CHART.primary} />
            <Bar dataKey="expansion_mrr_usd" name="Expansion" stackId="mrr" fill={CHART.tertiary} />
            <Bar dataKey="contraction_mrr_usd" name="Contraction" stackId="mrr" fill={CHART.quaternary} />
            <Bar dataKey="churned_mrr_usd" name="Churned" stackId="mrr" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="charts-row">
        <div>
          <h3 className="section-title">Paying Subscribers by Plan (vs. Target Mix)</h3>
          {planMixRows.length === 0 ? (
            <EmptyState message="No active paying subscribers yet." />
          ) : (
            <DataTable columns={planMixColumns} rows={planMixRows} />
          )}
        </div>
        <div>
          <h3 className="section-title">Monthly vs. Annual Split</h3>
          {intervalRows.length === 0 ? (
            <EmptyState message="No active subscriptions yet." />
          ) : (
            <DataTable columns={intervalColumns} rows={intervalRows} />
          )}
        </div>
      </div>
    </div>
  );
}
