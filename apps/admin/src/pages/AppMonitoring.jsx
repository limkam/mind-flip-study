import {
  Bar,
  BarChart,
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
import { ChartSkeleton, MetricsSkeleton } from '../components/AnalyticsSkeleton';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_APP_MONITORING } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

export default function AppMonitoring() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/app-monitoring', ['admin-app-monitoring']);

  const { data: celeryStatus } = useQuery({
    queryKey: ['admin-celery-status'],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/celery-status');
      return res;
    },
    refetchInterval: 30000,
  });

  const d = { ...EMPTY_APP_MONITORING, ...data };
  const health = { ...EMPTY_APP_MONITORING.assignment_health, ...d.assignment_health };
  const dailyActivity = d.daily_activity?.length
    ? d.daily_activity
    : EMPTY_APP_MONITORING.daily_activity;
  const featureUsage = d.feature_usage?.length
    ? d.feature_usage
    : EMPTY_APP_MONITORING.feature_usage;

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="App Monitoring" />
        <MetricsSkeleton count={4} />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="App Monitoring"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="DAU" value={d.dau} />
        <MetricCard label="WAU" value={d.wau} />
        <MetricCard label="MAU" value={d.mau} />
        <MetricCard label="Avg Quiz Score (%)" value={`${d.avg_quiz_score_pct}%`} />
        <div className={`metric-card celery-status-card${celeryStatus?.status === 'ok' ? ' celery-ok' : ' celery-down'}`}>
          <div className="metric-value">{celeryStatus?.status === 'ok' ? 'Running' : 'Unavailable'}</div>
          <div className="metric-label">Celery Worker</div>
          <p className="celery-status-hint">
            {celeryStatus?.status === 'ok'
              ? (celeryStatus.workers?.length
                ? `${celeryStatus.workers.length} worker(s) connected`
                : 'Worker responding')
              : 'Unavailable — flashcard jobs will not process'}
          </p>
        </div>
      </div>

      <h3 className="section-title">Daily Activity (Last 30 Days)</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={dailyActivity} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="events" name="Events" stroke={CHART.events} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="unique_users" name="Unique Users" stroke={CHART.users} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="section-title">Feature Usage Breakdown</h3>
      <div className="chart-wrap chart-wrap-half">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={featureUsage} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="feature" width={160} />
            <Tooltip />
            <Bar dataKey="count" fill={CHART.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="section-title">Assignment Processing Health</h3>
      <div className="health-panel metrics-grid">
        <MetricCard label="Total Assignments" value={health.total_assignments ?? 0} />
        <MetricCard label="Processed (with flashcards)" value={health.processed ?? 0} />
        <MetricCard label="Pending / Not Processed" value={health.pending ?? 0} />
        <MetricCard label="Completed by Student" value={health.completed_by_student ?? 0} />
        <MetricCard label="Books Uploaded" value={health.books_uploaded ?? 0} />
        <MetricCard label="Quiz Sessions" value={health.quiz_sessions ?? 0} />
      </div>
    </div>
  );
}
