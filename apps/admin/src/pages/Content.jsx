import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import DataTable from '../components/DataTable';
import MetricCard from '../components/MetricCard';
import { PageHeader, StatusBadge } from '../components/AdminUI';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'processing', label: 'Processing' },
  { id: 'error', label: 'Error' },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Content() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const params = { page, size: 20, q: search || undefined };
  if (tab === 'flagged') params.flagged = true;
  if (tab === 'processing') params.status = 'processing';
  if (tab === 'error') params.status = 'error';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-books', tab, page, search],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/books', { params });
      return res;
    },
  });
  const stats = useQuery({ queryKey: ['admin-content-stats'], queryFn: async () => (await client.get('/admin/control/content-stats')).data });

  const columns = [
    { key: 'book_code', label: 'Code' },
    { key: 'uploader_name', label: 'Uploaded By' },
    {
      key: 'created_at',
      label: 'Upload Date',
      render: (row) => formatDate(row.created_at),
    },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    {
      key: 'is_flagged',
      label: 'Flagged',
      render: (row) => row.is_flagged ? <StatusBadge value="Flagged" tone="critical" /> : '—',
    },
  ];

  return (
    <div>
      <PageHeader title="Content" description="Review uploaded material, processing state, and moderation signals." />
      <div className="metrics-grid">
        {stats.data && [['Total Books','total_books'],['Flashcard Sets','total_sets'],['Flashcards','total_flashcards'],['Uploads Today','uploads_today'],['Uploads 7d','uploads_7d'],['Uploads 30d','uploads_30d'],['Flagged','flagged']].map(([label,key]) => <MetricCard key={key} label={label} value={stats.data[key]} />)}
      </div>
      <div className="filters-row"><input type="search" value={search} placeholder="Search by book code…" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
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
          onRowClick={(row) => navigate(`/content/${row.id}`)}
        />
      )}
    </div>
  );
}
