import { Link } from "react-router-dom";
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
} from "recharts";
import AdminPageHeader from "../components/AdminPageHeader";
import { ChartSkeleton, MetricsSkeleton } from "../components/AnalyticsSkeleton";
import FetchErrorBanner from "../components/FetchErrorBanner";
import MetricCard from "../components/MetricCard";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { EMPTY_METRICS } from "../lib/analyticsDefaults";
import { CHART } from "../lib/chartColors";

export default function Metrics() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard("/admin/metrics", ["admin-metrics"]);

  const d = { ...EMPTY_METRICS, ...data };
  const usageByFeature = d.usage_by_feature?.length
    ? d.usage_by_feature
    : EMPTY_METRICS.usage_by_feature;
  const aiCostDaily = d.ai_cost_daily?.length ? d.ai_cost_daily : EMPTY_METRICS.ai_cost_daily;

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Metrics" />
        <MetricsSkeleton count={4} />
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Metrics"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />
      <p className="text-muted" style={{ marginBottom: "1rem" }}>
        For per-call token usage, pipeline version, and generation job details,
        open <Link to="/admin/ai-usage">AI Usage &amp; Cost</Link>.
      </p>

      <div className="metrics-grid">
        <MetricCard label="Study DAU" value={d.dau} />
        <MetricCard label="Signups (30d)" value={d.signups_30d} />
        <MetricCard label="Book Count" value={d.total_books} />
        <MetricCard label="Paying Users" value={d.paying_users} />
        <MetricCard
          label="Active Contracted MRR (USD)"
          value={`$${Number(d.mrr_usd ?? 0).toFixed(2)}`}
        />
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="Onboarding Rate (30d)"
          value={`${d.onboarding_rate_pct}%`}
        />
        <MetricCard
          label="Onboarding Started (30d)"
          value={d.onboarding_started_30d}
        />
        <MetricCard
          label="Onboarding Completed (30d)"
          value={d.onboarding_completed_30d}
        />
        <MetricCard
          label="Churned Users (30d)"
          value={d.churned_users_30d}
        />
        <MetricCard
          label="Churn Rate (30d)"
          value={`${d.churn_rate_pct}%`}
        />
      </div>

      <div className="metrics-grid">
        <MetricCard label="AI Traffic (30d calls)" value={d.ai_generations_30d} />
        <MetricCard
          label="AI Cost (30d USD)"
          value={`$${Number(d.ai_cost_30d_usd ?? 0).toFixed(4)}`}
        />
      </div>

      <h3 className="section-title">AI Traffic &amp; Cost (Last 30 Days)</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={aiCostDaily} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
            <YAxis yAxisId="left" allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="ai_calls" name="AI Calls" stroke={CHART.primary} strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="ai_cost_usd" name="AI Cost (USD)" stroke={CHART.tertiary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="section-title">Usage by Feature (Last 30 Days)</h3>
      <p className="text-muted" style={{ marginBottom: "0.5rem" }}>
        Games are not included — no session/completion event is currently tracked for that feature.
      </p>
      <div className="chart-wrap chart-wrap-half">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={usageByFeature} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="feature" width={140} />
            <Tooltip />
            <Bar dataKey="count" fill={CHART.secondary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
