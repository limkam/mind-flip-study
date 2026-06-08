import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminPageHeader from '../components/AdminPageHeader';
import { ChartSkeleton, MetricsSkeleton } from '../components/AnalyticsSkeleton';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import UserIpTable from '../components/UserIpTable';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_DEMOGRAPHICS } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

function HorizontalBarChart({ data }) {
  const chartData = data?.length ? data : [{ label: 'No data', count: 0 }];
  return (
    <div className="chart-wrap chart-wrap-half">
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={100} />
          <Tooltip />
          <Bar dataKey="count" fill={CHART.secondary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({ data }) {
  const chartData = data?.length
    ? data.map((d) => ({ name: d.label, value: d.count }))
    : [{ name: 'No data', value: 1 }];
  return (
    <div className="chart-wrap chart-wrap-half">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={data?.length ? CHART.donut[i % CHART.donut.length] : '#e2e8f0'} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Demographics() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/demographics', ['admin-demographics']);

  const d = { ...EMPTY_DEMOGRAPHICS, ...data };
  const growth = d.user_growth_monthly?.length
    ? d.user_growth_monthly
    : EMPTY_DEMOGRAPHICS.user_growth_monthly;
  const topics = d.top_study_topics || [];

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Demographics" />
        <MetricsSkeleton count={4} />
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Demographics"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Total Users" value={d.total_users} />
        <MetricCard label="Countries" value={d.countries_distinct} />
        <MetricCard label="Continents" value={d.continents_distinct} />
        <MetricCard label="Active Licenses" value={d.active_licenses} />
      </div>

      <h3 className="section-title">User Growth (Last 12 Months)</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={growth} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis yAxisId="left" allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="new_users" name="New Users" stroke={CHART.primary} strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="cumulative_users" name="Total Users" stroke={CHART.tertiary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="charts-row">
        <div>
          <h3 className="section-title">Users by Country (Top 12)</h3>
          <HorizontalBarChart data={d.users_by_country} />
        </div>
        <div>
          <h3 className="section-title">Users by Continent</h3>
          <HorizontalBarChart data={d.users_by_continent} />
        </div>
      </div>

      <div className="charts-row">
        <div>
          <h3 className="section-title">Users by Occupation (Top 12)</h3>
          <HorizontalBarChart data={d.users_by_occupation} />
        </div>
        <div>
          <h3 className="section-title">Users by Age Group</h3>
          <HorizontalBarChart data={d.users_by_age_group} />
        </div>
      </div>

      <div className="charts-row">
        <div>
          <h3 className="section-title">Plan Distribution</h3>
          <DonutChart data={d.plan_distribution} />
        </div>
        <div>
          <h3 className="section-title">Users by Role</h3>
          <DonutChart data={d.users_by_role} />
        </div>
      </div>

      <h3 className="section-title">User IP Addresses</h3>
      <UserIpTable />

      <h3 className="section-title">Top Study Topics</h3>
      {topics.length === 0 ? (
        <EmptyState message="No study topic data yet." />
      ) : (
        <ol className="topic-list">
          {topics.map((t) => (
            <li key={t.rank}>
              <span className="topic-rank">{t.rank}</span>
              <span className="topic-name">{t.topic}</span>
              <span className="topic-count">{t.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
