import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
import { EMPTY_FINANCIAL } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

export default function FinancialAnalytics() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/financial-analytics', ['admin-financial-analytics']);

  const d = { ...EMPTY_FINANCIAL, ...data };
  const revenueMonthly = d.revenue_monthly?.length
    ? d.revenue_monthly
    : EMPTY_FINANCIAL.revenue_monthly;

  const planData = (d.revenue_by_plan || []).length
    ? d.revenue_by_plan.map((item) => ({ name: item.label, value: item.amount_usd }))
    : [{ name: 'No data', value: 1 }];

  const continentData = (d.revenue_by_continent || []).length
    ? d.revenue_by_continent.map((item) => ({ label: item.label, amount_usd: item.amount_usd }))
    : [{ label: 'No data', amount_usd: 0 }];

  const columns = [
    { key: 'country', label: 'Country' },
    { key: 'users', label: 'Users' },
    {
      key: 'monthly_revenue_usd',
      label: 'Monthly Revenue',
      render: (row) => `$${row.monthly_revenue_usd.toFixed(2)}`,
    },
    {
      key: 'pct_of_total',
      label: '% of Total',
      render: (row) => `${row.pct_of_total}%`,
    },
  ];

  const tableRows = (d.revenue_by_country || []).map((row, i) => ({
    id: `${row.country}-${i}`,
    ...row,
  }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Financial Analytics" />
        <MetricsSkeleton count={4} />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Financial Analytics"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="MRR" value={`$${d.mrr_usd.toFixed(2)}`} />
        <MetricCard label="ARR" value={`$${d.arr_usd.toFixed(2)}`} />
        <MetricCard label="Paying Users" value={d.paying_users} />
        <MetricCard label="Avg Revenue per User" value={`$${d.avg_revenue_per_user_usd.toFixed(2)}`} />
      </div>

      <h3 className="section-title">Revenue Over Time (Monthly)</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={revenueMonthly} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']} />
            <Bar dataKey="revenue_usd" name="Revenue" fill={CHART.revenue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="charts-row">
        <div>
          <h3 className="section-title">Revenue by Plan</h3>
          <div className="chart-wrap chart-wrap-half">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {planData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.revenue_by_plan?.length
                          ? CHART.donut[i % CHART.donut.length]
                          : '#e2e8f0'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 className="section-title">Revenue by Continent</h3>
          <div className="chart-wrap chart-wrap-half">
            <ResponsiveContainer width="100%" height={Math.max(200, continentData.length * 36)}>
              <BarChart data={continentData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="label" width={100} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="amount_usd" fill={CHART.secondary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h3 className="section-title">Revenue by Country (Top 10)</h3>
      {tableRows.length === 0 ? (
        <EmptyState message="No country revenue data yet." />
      ) : (
        <DataTable columns={columns} rows={tableRows} />
      )}
    </div>
  );
}
