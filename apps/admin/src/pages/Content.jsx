import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import DataTable from '../components/DataTable';

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

export default function Content() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);

  const params = { page, size: 20 };
  if (tab === 'flagged') params.flagged = true;
  if (tab === 'processing') params.status = 'processing';
  if (tab === 'error') params.status = 'error';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-books', tab, page],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/books', { params });
      return res;
    },
  });

  const flagBook = useMutation({
    mutationFn: (id) => client.post(`/admin/books/${id}/flag`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
      setConfirm(null);
    },
  });

  const deleteBook = useMutation({
    mutationFn: (id) => client.delete(`/admin/books/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
      setConfirm(null);
    },
  });

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'uploader_name', label: 'Uploaded By' },
    {
      key: 'created_at',
      label: 'Upload Date',
      render: (row) => formatDate(row.created_at),
    },
    { key: 'status', label: 'Status' },
    {
      key: 'is_flagged',
      label: 'Flagged',
      render: (row) => (row.is_flagged ? 'Yes' : 'No'),
    },
  ];

  return (
    <div>
      <h2 className="page-title">Content</h2>
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
          renderActions={(row) => (
            <select
              className="action-select"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = '';
                if (v === 'flag') {
                  setConfirm({
                    title: 'Flag content',
                    message: `Flag "${row.title}" for review?`,
                    onConfirm: () => flagBook.mutate(row.id),
                  });
                }
                if (v === 'delete') {
                  setConfirm({
                    title: 'Delete book',
                    message:
                      'This will permanently delete the book and all associated flashcard sets.',
                    onConfirm: () => deleteBook.mutate(row.id),
                  });
                }
              }}
            >
              <option value="">Actions…</option>
              {!row.is_flagged && <option value="flag">Flag Content</option>}
              <option value="delete">Delete Book</option>
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
