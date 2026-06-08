import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import DataTable from '../components/DataTable';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'resolved', label: 'Resolved' },
];

export default function Feedback() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-feedback', debouncedQ, status, page],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/feedback', {
        params: {
          q: debouncedQ,
          status: status || undefined,
          page,
          size: 20,
        },
      });
      return res;
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, newStatus }) => client.patch(`/admin/feedback/${id}`, { status: newStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }),
  });

  const columns = [
    {
      key: 'created_at',
      label: 'Submitted',
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'user_name',
      label: 'User',
      render: (row) => (
        <div>
          <div>{row.user_name}</div>
          <div className="text-muted">{row.user_email}</div>
        </div>
      ),
    },
    { key: 'category', label: 'Category', render: (row) => row.category || '—' },
    {
      key: 'content',
      label: 'Feedback',
      render: (row) => <span className="feedback-content">{row.content}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`status-badge status-${row.status}`}>{row.status}</span>
      ),
    },
  ];

  const onStatusChange = useCallback(
    (row, newStatus) => {
      if (row.status === newStatus) return;
      updateStatus.mutate({ id: row.id, newStatus });
    },
    [updateStatus],
  );

  return (
    <div>
      <h2 className="page-title">Feedback Management</h2>
      <div className="filters-row">
        <input
          className="search-input"
          type="search"
          placeholder="Search feedback, user, or category…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="filter-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          page={page}
          total={data?.total ?? 0}
          size={20}
          onPageChange={setPage}
          renderActions={(row) => (
            <select
              className="action-select"
              value={row.status}
              onChange={(e) => onStatusChange(row, e.target.value)}
            >
              <option value="pending">Mark pending</option>
              <option value="reviewed">Mark reviewed</option>
              <option value="resolved">Mark resolved</option>
            </select>
          )}
        />
      )}
    </div>
  );
}
