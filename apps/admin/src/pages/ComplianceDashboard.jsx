import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { EMPTY_COMPLIANCE } from '../lib/analyticsDefaults';
import { CHART } from '../lib/chartColors';

export default function ComplianceDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/compliance', ['owner-console-compliance']);

  const d = { ...EMPTY_COMPLIANCE, ...data };

  const dmcaColumns = [
    { key: 'book_title', label: 'Content', render: (row) => row.book_title || '(removed)' },
    { key: 'claimant_name', label: 'Claimant' },
    { key: 'status', label: 'Status' },
    { key: 'days_remaining', label: 'Days Remaining', render: (row) => (row.days_remaining < 0 ? `${Math.abs(row.days_remaining)}d overdue` : row.days_remaining) },
    { key: 'counter_notice_filed', label: 'Counter-Notice', render: (row) => (row.counter_notice_filed ? 'Filed' : '—') },
    { key: 'target_user_strike_count', label: 'Strikes' },
  ];
  const dmcaRows = (d.dmca_queue || []).map((r) => ({ id: r.id, ...r }));

  const flagColumns = [
    { key: 'book_title', label: 'Content' },
    { key: 'flagged_by_admin', label: 'Flagged By', render: (row) => row.flagged_by_admin || '—' },
    { key: 'flagged_at', label: 'Flagged At', render: (row) => (row.flagged_at ? new Date(row.flagged_at).toLocaleString() : '—') },
    { key: 'reason', label: 'Reason', render: (row) => row.reason || '—' },
  ];
  const flagRows = (d.content_flags || []).map((r, i) => ({ id: `${r.book_id}-${i}`, ...r }));

  const privacyColumns = [
    { key: 'requester_email', label: 'Requester' },
    { key: 'request_type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'days_remaining', label: 'SLA Days Remaining', render: (row) => (row.days_remaining < 0 ? `${Math.abs(row.days_remaining)}d overdue` : row.days_remaining) },
  ];
  const privacyRows = (d.privacy_requests || []).map((r) => ({ id: r.id, ...r }));

  const trialColumns = [
    { key: 'sent_at', label: 'Sent At', render: (row) => new Date(row.sent_at).toLocaleString() },
    { key: 'status', label: 'Status' },
  ];
  const trialRows = (d.trial_reminder_log || []).map((r, i) => ({ id: `trial-${i}`, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Compliance" />
        <MetricsSkeleton count={2} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Compliance"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Chargeback/Dispute Rate (30d)" value={`${d.chargeback_rate_pct}%`} delta={d.chargeback_alert ? d.chargeback_rate_pct : null} />
        <MetricCard label="Flagged Content (total)" value={d.content_flags_total} />
        <MetricCard label="Open Privacy Requests" value={(d.privacy_requests || []).filter((r) => r.status !== 'completed').length} />
      </div>
      {d.chargeback_alert && (
        <FetchErrorBanner message={`Chargeback rate is ${d.chargeback_rate_pct}% — above the 0.75% alert threshold.`} />
      )}

      <h3 className="section-title">Under-13 Blocked Signups (30d)</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.underage_blocked_trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Blocked signups" fill={CHART.quaternary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="section-title">DMCA Queue</h3>
      {dmcaRows.length === 0 ? (
        <EmptyState message="No DMCA notices on file. (No intake flow exists yet — this table is ready to receive notices.)" />
      ) : (
        <DataTable columns={dmcaColumns} rows={dmcaRows} />
      )}

      <h3 className="section-title">Flagged Content Queue</h3>
      {flagRows.length === 0 ? (
        <EmptyState message="No flagged content." />
      ) : (
        <DataTable columns={flagColumns} rows={flagRows} />
      )}

      <h3 className="section-title">Privacy Request Queue (30-Day SLA)</h3>
      {privacyRows.length === 0 ? (
        <EmptyState message="No privacy requests on file. (No intake flow exists yet — this table is ready to receive requests.)" />
      ) : (
        <DataTable columns={privacyColumns} rows={privacyRows} />
      )}

      <h3 className="section-title">Trial-Reminder Send Log</h3>
      <p className="admin-note">{d.trial_reminder_note}</p>
      {trialRows.length === 0 ? (
        <EmptyState message="No trial-reminder emails sent." />
      ) : (
        <DataTable columns={trialColumns} rows={trialRows} />
      )}
    </div>
  );
}
