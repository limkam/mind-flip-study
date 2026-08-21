import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminPageHeader from '../components/AdminPageHeader';
import { MetricsSkeleton, TableSkeleton } from '../components/AnalyticsSkeleton';
import DataTable from '../components/DataTable';
import FetchErrorBanner from '../components/FetchErrorBanner';
import MetricCard from '../components/MetricCard';
import client from '../api/client';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { EMPTY_GOVERNANCE } from '../lib/analyticsDefaults';

async function downloadAuditLogCsv() {
  const { data } = await client.get('/admin/owner-console/governance/audit-log-export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'admin-audit-log.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function GovernanceDashboard() {
  const {
    data,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    lastUpdated,
    refresh,
  } = useAdminDashboard('/admin/owner-console/governance', ['owner-console-governance']);

  const [page, setPage] = useState(1);
  const auditQuery = useQuery({
    queryKey: ['owner-console-governance-audit-log', page],
    queryFn: async () => {
      const { data: auditData } = await client.get('/admin/control/audit-log', { params: { page, size: 50 } });
      return auditData;
    },
  });

  const d = { ...EMPTY_GOVERNANCE, ...data };

  const actionColumns = [
    { key: 'action', label: 'Action' },
    { key: 'count_30d', label: 'Count (30d)' },
  ];
  const actionRows = (d.top_actions_30d || []).map((r, i) => ({ id: `${r.action}-${i}`, ...r }));

  const adminColumns = [
    { key: 'admin_email', label: 'Admin' },
    { key: 'action_count_30d', label: 'Actions (30d)' },
  ];
  const adminRows = (d.most_active_admins_30d || []).map((r, i) => ({ id: `${r.admin_email}-${i}`, ...r }));

  const roleColumns = [
    { key: 'admin_role', label: 'Admin Role' },
    { key: 'admin_count', label: 'Admins' },
  ];
  const roleRows = (d.admin_role_counts || []).map((r, i) => ({ id: `${r.admin_role}-${i}`, ...r }));

  const auditColumns = [
    { key: 'created_at', label: 'Time', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'admin_email', label: 'Admin' },
    { key: 'action', label: 'Action' },
    { key: 'resource_type', label: 'Resource' },
    { key: 'resource_id', label: 'Target' },
    { key: 'reason', label: 'Reason' },
  ];
  const auditRows = (auditQuery.data?.items || []).map((r) => ({ id: r.id, ...r }));

  if (isLoading && !data) {
    return (
      <div>
        <AdminPageHeader title="Governance" />
        <MetricsSkeleton count={2} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Governance"
        lastUpdated={!isError ? lastUpdated : undefined}
        onRefresh={refresh}
        isRefreshing={isFetching}
      />
      <FetchErrorBanner message={isError ? errorMessage : null} onRetry={refresh} isRetrying={isFetching} />

      <div className="metrics-grid">
        <MetricCard label="Total Audit Log Entries" value={d.total_audit_log_entries} />
        <MetricCard label="Entries (30d)" value={d.entries_30d} />
      </div>

      <p className="admin-note">
        Owner Console pages are gated by admin_role (owner/finance/support/marketer). Every page in
        this build is currently owner-only, pending the real per-module role mapping. Assigning
        admin_role to specific admins is a control (user management) and out of scope here.
      </p>

      <h3 className="section-title">Admins by Role</h3>
      <DataTable columns={roleColumns} rows={roleRows} />

      <div className="charts-row">
        <div>
          <h3 className="section-title">Top Actions (30d)</h3>
          <DataTable columns={actionColumns} rows={actionRows} />
        </div>
        <div>
          <h3 className="section-title">Most Active Admins (30d)</h3>
          <DataTable columns={adminColumns} rows={adminRows} />
        </div>
      </div>

      <h3 className="section-title">
        Audit Log
        <button type="button" className="btn-refresh" style={{ marginLeft: 12 }} onClick={downloadAuditLogCsv}>
          Export CSV
        </button>
      </h3>
      {auditQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={auditColumns}
          rows={auditRows}
          page={page}
          total={auditQuery.data?.total || 0}
          size={50}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
