import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';
import DataTable from './DataTable';
import EmptyState from './EmptyState';
import { TableSkeleton } from './AnalyticsSkeleton';

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function UserIpTable() {
  const [expanded, setExpanded] = useState({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-user-ips'],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/user-ips');
      return res;
    },
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError) return <EmptyState message="Could not load IP addresses." />;

  const rows = (data?.items || []).map((row) => ({
    id: row.user_id,
    ...row,
  }));

  const columns = [
    { key: 'username', label: 'Username' },
    { key: 'email', label: 'Email' },
    { key: 'last_ip', label: 'Last IP', render: (r) => r.last_ip || '—' },
    { key: 'last_seen', label: 'Last Seen', render: (r) => formatWhen(r.last_seen) },
    {
      key: 'ip_history',
      label: 'IP History',
      render: (r) => {
        const hist = r.ip_history || [];
        if (!hist.length) return '—';
        const open = expanded[r.id];
        return (
          <div>
            <button
              type="button"
              className="ip-history-toggle"
              onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !open }))}
            >
              {open ? 'Hide' : `Show (${hist.length})`}
            </button>
            {open && (
              <ul className="ip-history-list">
                {[...hist].reverse().map((entry, i) => (
                  <li key={`${entry.ip}-${entry.timestamp}-${i}`}>
                    {entry.ip}
                    {' '}
                    —
                    {' '}
                    {formatWhen(entry.timestamp)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      },
    },
  ];

  if (!rows.length) {
    return <EmptyState message="No IP data captured yet." />;
  }

  return <DataTable columns={columns} rows={rows} />;
}
