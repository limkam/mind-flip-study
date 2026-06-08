import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import DataTable from '../components/DataTable';

const AGE_GROUP_OPTIONS = [
  '',
  '0-9',
  '10-17',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
];

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'age', label: 'Age (youngest first)' },
  { value: '-age', label: 'Age (oldest first)' },
];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [sort, setSort] = useState('-created_at');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', debouncedQ, ageGroup, sort, page],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/users', {
        params: {
          q: debouncedQ,
          age_group: ageGroup || undefined,
          sort,
          page,
          size: 20,
        },
      });
      return res;
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }) => client.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setConfirm(null);
    },
  });

  const runAction = useCallback(
    (row, action) => {
      const actions = {
        makeAdmin: {
          title: 'Make admin',
          message: `Grant admin role to ${row.full_name}?`,
          body: { role: 'admin' },
        },
        makeStudent: {
          title: 'Make student',
          message: `Set ${row.full_name} to student role?`,
          body: { role: 'student' },
        },
        ban: {
          title: 'Ban account',
          message: `Ban ${row.full_name}? They will not be able to sign in.`,
          body: { is_banned: true },
        },
        unban: {
          title: 'Unban account',
          message: `Restore access for ${row.full_name}?`,
          body: { is_banned: false },
        },
      };
      const cfg = actions[action];
      setConfirm({
        ...cfg,
        onConfirm: () => patchUser.mutate({ id: row.id, body: cfg.body }),
      });
    },
    [patchUser],
  );

  const columns = [
    { key: 'full_name', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    {
      key: 'date_of_birth',
      label: 'Date of Birth',
      render: (row) => formatDate(row.date_of_birth),
    },
    {
      key: 'age',
      label: 'Current Age',
      render: (row) => (row.age != null ? row.age : '—'),
    },
    {
      key: 'age_group',
      label: 'Age Group',
      render: (row) => row.age_group || '—',
    },
    {
      key: 'country',
      label: 'Country',
      render: (row) => row.country || '—',
    },
    {
      key: 'custom_country',
      label: 'Custom Country',
      render: (row) => row.custom_country || '—',
    },
    {
      key: 'continent',
      label: 'Continent',
      render: (row) => row.continent || '—',
    },
    {
      key: 'occupation',
      label: 'Occupation',
      render: (row) => row.occupation || '—',
    },
    {
      key: 'created_at',
      label: 'Joined Date',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'is_banned',
      label: 'Status',
      render: (row) => (row.is_banned ? 'Banned' : 'Active'),
    },
  ];

  return (
    <div>
      <h2 className="page-title">Users</h2>
      <div className="filters-row">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="filter-select"
          value={ageGroup}
          onChange={(e) => {
            setAgeGroup(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All age groups</option>
          {AGE_GROUP_OPTIONS.filter(Boolean).map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {SORT_OPTIONS.map((opt) => (
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
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = '';
                if (v) runAction(row, v);
              }}
            >
              <option value="">Actions…</option>
              {row.role !== 'admin' && <option value="makeAdmin">Make Admin</option>}
              {row.role !== 'student' && <option value="makeStudent">Make Student</option>}
              {!row.is_banned && <option value="ban">Ban Account</option>}
              {row.is_banned && <option value="unban">Unban Account</option>}
            </select>
          )}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
