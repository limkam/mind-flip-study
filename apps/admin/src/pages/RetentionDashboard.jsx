import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_RETENTION } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

function buildCohortChartData(cohortRetention) {
  const months = [...new Set(cohortRetention.map((r) => r.cohort_month))];
  const weeks = [...new Set(cohortRetention.map((r) => r.week))].sort((a, b) => a - b);
  const rows = weeks.map((week) => {
    const point = { week: `Week ${week}` };
    months.forEach((month) => {
      const match = cohortRetention.find((r) => r.week === week && r.cohort_month === month);
      point[month] = match ? match.retained_pct : null;
    });
    return point;
  });
  return { months, rows };
}

export default function RetentionDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/retention', ['owner-console-retention']);

  const d = { ...EMPTY_RETENTION, ...data };
  const { months, rows } = buildCohortChartData(d.cohort_retention || []);

  const reasonColumns = [
    { key: 'reason', label: 'Reason' },
    { key: 'count', label: 'Cancellations' },
  ];
  const reasonRows = (d.cancellation_reasons || []).map((r, i) => ({ id: `${r.reason}-${i}`, ...r }));

  const day2Columns = [
    { key: 'channel', label: 'Channel' },
    { key: 'cohort_size', label: 'Cohort Size' },
    { key: 'completed_day2_review', label: 'Completed Day-2 Review' },
    { key: 'completion_pct', label: 'Completion %', render: (row) => `${row.completion_pct}%` },
  ];
  const day2Rows = (d.day2_review_by_channel || []).map((r, i) => ({ id: `${r.channel}-${i}`, ...r }));

  const streakColumns = [
    { key: 'bucket', label: 'Streak Length (days)' },
    { key: 'users', label: 'Users' },
  ];
  const streakRows = (d.streak_distribution || []).map((r, i) => ({ id: `${r.bucket}-${i}`, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Retention" />
        <MetricsSkeleton count={3} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Retention"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Monthly Churn" value={`${d.monthly_churn_rate_pct}%`} />
        <MetricCard label="Lapsed User Backlog" value={d.lapsed_user_backlog} />
        <MetricCard label="Lapsed → Renewed (60d)" value={`${d.lapsed_to_renewed_60d_pct}%`} />
      </div>

      <h3 className="section-title">Cancellation Reasons (This Month)</h3>
      {reasonRows.length === 0 ? (
        <EmptyState message="No cancellations this month." />
      ) : (
        <DataTable columns={reasonColumns} rows={reasonRows} />
      )}

      <h3 className="section-title">Cohort Retention (Week-by-Week, per Signup Month)</h3>
      {rows.length === 0 ? (
        <EmptyState message="Not enough subscription history yet to plot cohort curves." />
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip formatter={(v) => (v == null ? 'n/a' : `${v}%`)} />
              <Legend />
              {months.map((month, i) => (
                <Line key={month} type="monotone" dataKey={month} stroke={CHART.donut[i % CHART.donut.length]} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <h3 className="section-title">Day-2 Review Completion by Acquisition Source</h3>
      {day2Rows.length === 0 ? (
        <EmptyState message="No signups old enough to measure day-2 completion yet." />
      ) : (
        <DataTable columns={day2Columns} rows={day2Rows} />
      )}

      <h3 className="section-title">Streak Distribution</h3>
      {streakRows.length === 0 ? (
        <EmptyState message="No streak data yet." />
      ) : (
        <DataTable columns={streakColumns} rows={streakRows} />
      )}
    </div>
  );
}
