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
import { EMPTY_PLATFORM_STATS } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function PlatformStats() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/platform-stats', ['admin-platform-stats']);

  const d = { ...EMPTY_PLATFORM_STATS, ...data };

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Platform Statistics" />
        <MetricsSkeleton count={11} />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  const chartData = d.content_created_monthly?.length
    ? d.content_created_monthly
    : EMPTY_PLATFORM_STATS.content_created_monthly;

  const columns = [
    { key: 'username', label: 'Username' },
    { key: 'quizzes_taken', label: 'Quizzes Taken' },
    {
      key: 'avg_score_pct',
      label: 'Avg Score',
      render: (row) => `${row.avg_score_pct}%`,
    },
    { key: 'books_uploaded', label: 'Books Uploaded' },
    {
      key: 'last_active',
      label: 'Last Active',
      render: (row) => formatDate(row.last_active),
    },
  ];

  const tableRows = (d.most_active_users || []).map((row, i) => ({
    id: `${row.username}-${i}`,
    ...row,
  }));

  return (
    <div>
      <AdminPageHeader
        title="Platform Statistics"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Total Users" value={d.total_users} />
        <MetricCard label="Books Uploaded" value={d.books_uploaded} />
        <MetricCard label="Flashcard Sets" value={d.flashcard_sets} />
        <MetricCard label="Quiz Sessions" value={d.quiz_sessions} />
        <MetricCard label="Assignments" value={d.assignments} />
        <MetricCard label="Avg Quiz Score (%)" value={`${d.avg_quiz_score_pct}%`} />
        <MetricCard label="Workbooks" value={d.workbooks} />
        <MetricCard label="Assignments Completed" value={d.assignments_completed} />
        <MetricCard label="Perfect Quiz Scores" value={d.perfect_quiz_scores} />
        <MetricCard label="Avg Cards per Set" value={d.avg_cards_per_set} />
      </div>

      <h3 className="section-title">Content Created Over Time</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="books" name="Books Uploaded" fill={CHART.books} radius={[4, 4, 0, 0]} />
            <Bar dataKey="flashcard_sets" name="Flashcard Sets" fill={CHART.sets} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="section-title">Most Active Users</h3>
      {tableRows.length === 0 ? (
        <EmptyState message="No active users yet." />
      ) : (
        <DataTable columns={columns} rows={tableRows} />
      )}
    </div>
  );
}
