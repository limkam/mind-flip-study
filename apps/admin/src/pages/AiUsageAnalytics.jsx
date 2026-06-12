import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client, { apiBaseUrl } from '../api/client';
import MetricCard from '../components/MetricCard';
import FetchErrorBanner from '../components/FetchErrorBanner';

function errorMessage(err) {
  return err?.response?.data?.detail || err?.message || 'Failed to load data';
}

function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function fmtTokens(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

function fmtCost(n) {
  if (n == null) return '—';
  return `$${Number(n).toFixed(4)}`;
}

export default function AiUsageAnalytics() {
  const [userFilter, setUserFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [logOffset, setLogOffset] = useState(0);
  const logLimit = 50;

  const {
    data,
    isLoading,
    isError: summaryError,
    error: summaryErr,
  } = useQuery({
    queryKey: ['admin-ai-usage'],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/ai-usage');
      return res;
    },
    refetchInterval: 60000,
  });

  const {
    data: logs,
    isLoading: logsLoading,
    isError: logsError,
    error: logsErr,
  } = useQuery({
    queryKey: ['admin-ai-usage-logs', userFilter, jobFilter, logOffset],
    queryFn: async () => {
      const params = { limit: logLimit, offset: logOffset };
      if (userFilter) params.user_id = userFilter;
      if (jobFilter.trim()) params.celery_task_id = jobFilter.trim();
      const { data: res } = await client.get('/admin/ai-usage/logs', { params });
      return res;
    },
    refetchInterval: 30000,
  });

  const {
    data: jobDetail,
    isLoading: jobDetailLoading,
  } = useQuery({
    queryKey: ['admin-generation-job', jobFilter],
    queryFn: async () => {
      const { data: res } = await client.get(`/admin/generation-jobs/${jobFilter.trim()}`);
      return res;
    },
    enabled: Boolean(jobFilter.trim()),
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return <p>Loading AI usage analytics…</p>;
  }

  const totalLogPages = logs ? Math.ceil(logs.total / logLimit) : 0;
  const currentLogPage = Math.floor(logOffset / logLimit) + 1;
  const isLocalApi = apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1');

  return (
    <div>
      <h2 className="page-title">AI Usage &amp; Cost Analytics</h2>
      {isLocalApi ? (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.08)',
          }}
        >
          <strong>Connected to local API:</strong> <code>{apiBaseUrl}</code>
          <p className="text-muted" style={{ margin: '0.35rem 0 0' }}>
            Production generations will not appear here unless <code>VITE_API_URL</code> points at
            your deployed backend (e.g. Railway). Redeploy the admin app after changing it.
          </p>
        </div>
      ) : (
        <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
          API: <code>{apiBaseUrl}</code>
        </p>
      )}
      <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
        Every Anthropic API call is stored in the <code>token_usage</code> table when flashcards,
        summaries, scenarios, or TOC extraction run.
      </p>
      <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
        Updated {new Date(data.updated_at).toLocaleString()}
      </p>

      {summaryError ? <FetchErrorBanner message={errorMessage(summaryErr)} /> : null}

      <div className="metrics-grid">
        <MetricCard label="Total AI Cost (USD)" value={fmtCost(data.total_cost_usd)} />
        <MetricCard label="Total API Calls" value={data.total_calls?.toLocaleString()} />
        <MetricCard label="Input Tokens" value={fmtTokens(data.total_input_tokens)} />
        <MetricCard label="Output Tokens" value={fmtTokens(data.total_output_tokens)} />
        <MetricCard label="Cached Tokens" value={fmtTokens(data.total_cached_tokens)} />
        <MetricCard label="Cache Hit Rate" value={`${data.cache_hit_rate_pct}%`} />
        <MetricCard label="Avg Generation Time" value={fmtMs(data.avg_duration_ms)} />
      </div>

      <h3 className="section-title">Cost by AI Task</h3>
      <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
        Granular breakdown by task name (e.g. generate_study_content, generate_scenarios).
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Feature</th>
              <th>Calls</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cached</th>
              <th>Cost</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {(data.by_task || []).map((row) => (
              <tr key={`${row.task}-${row.feature_type}`}>
                <td><code>{row.task}</code></td>
                <td>{row.feature_type || '—'}</td>
                <td>{row.calls}</td>
                <td>{fmtTokens(row.input_tokens)}</td>
                <td>{fmtTokens(row.output_tokens)}</td>
                <td>{fmtTokens(row.cached_tokens)}</td>
                <td>{fmtCost(row.total_cost_usd)}</td>
                <td>{fmtMs(row.avg_duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Cost by Feature</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Calls</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cached</th>
              <th>Cost</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {(data.by_feature || []).map((row) => (
              <tr key={row.feature_type}>
                <td>{row.feature_type}</td>
                <td>{row.calls}</td>
                <td>{fmtTokens(row.input_tokens)}</td>
                <td>{fmtTokens(row.output_tokens)}</td>
                <td>{fmtTokens(row.cached_tokens)}</td>
                <td>{fmtCost(row.total_cost_usd)}</td>
                <td>{fmtMs(row.avg_duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Per User (Top 50)</h3>
      <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
        Click a user row to filter the call log below.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Calls</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cached</th>
              <th>Cost</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {(data.by_user || []).map((row) => (
              <tr
                key={row.user_id}
                className={userFilter === row.user_id ? 'row-selected' : 'row-clickable'}
                onClick={() => {
                  setUserFilter((prev) => (prev === row.user_id ? '' : row.user_id));
                  setLogOffset(0);
                }}
                style={{ cursor: 'pointer' }}
              >
                <td>{row.email}</td>
                <td>{row.total_calls}</td>
                <td>{fmtTokens(row.input_tokens)}</td>
                <td>{fmtTokens(row.output_tokens)}</td>
                <td>{fmtTokens(row.cached_tokens)}</td>
                <td>{fmtCost(row.total_cost_usd)}</td>
                <td>{fmtMs(row.avg_duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Cost per Document (Top 20)</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Calls</th>
              <th>Cost</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {(data.by_book || []).map((row) => (
              <tr key={row.book_id}>
                <td>{row.book_title}</td>
                <td>{row.total_calls}</td>
                <td>{fmtCost(row.total_cost_usd)}</td>
                <td>{fmtTokens(row.input_tokens)}</td>
                <td>{fmtTokens(row.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Recent API Calls</h3>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Filter by Job ID (celery task)"
          value={jobFilter}
          onChange={(e) => {
            setJobFilter(e.target.value);
            setLogOffset(0);
          }}
          style={{ padding: '0.35rem 0.6rem', minWidth: '16rem' }}
        />
        {userFilter ? (
          <button
            type="button"
            className="admin-nav-link"
            style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border)' }}
            onClick={() => {
              setUserFilter('');
              setLogOffset(0);
            }}
          >
            Clear user filter
          </button>
        ) : (
          <span className="text-muted">Showing all users</span>
        )}
        {jobFilter.trim() ? (
          <button
            type="button"
            className="admin-nav-link"
            style={{ padding: '0.35rem 0.75rem', border: '1px solid var(--border)' }}
            onClick={() => {
              setJobFilter('');
              setLogOffset(0);
            }}
          >
            Clear job filter
          </button>
        ) : null}
        {logs ? (
          <span className="text-muted">
            {logs.total.toLocaleString()} total call{logs.total === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {logsError ? <FetchErrorBanner message={errorMessage(logsErr)} /> : null}

      {jobFilter.trim() ? (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Generation Job Detail</h4>
          {jobDetailLoading && !jobDetail ? (
            <p className="text-muted">Loading job detail…</p>
          ) : jobDetail ? (
            <>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Status:</strong> {jobDetail.qa_status || jobDetail.status || '—'}
                {jobDetail.phase ? ` · ${jobDetail.phase}` : ''}
              </p>
              {jobDetail.qa_failure_reason ? (
                <p style={{ margin: '0.25rem 0' }}>
                  <strong>QA Failure Reason:</strong>{' '}
                  <code>{jobDetail.qa_failure_validator || 'unknown'}</code>
                  {' — '}
                  {jobDetail.qa_failure_reason}
                </p>
              ) : null}
              {Array.isArray(jobDetail.qa_failures) && jobDetail.qa_failures.length > 0 ? (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary>All QA failures ({jobDetail.qa_failures.length})</summary>
                  <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '12rem' }}>
                    {JSON.stringify(jobDetail.qa_failures, null, 2)}
                  </pre>
                </details>
              ) : null}
              {Array.isArray(jobDetail.generation_metrics) && jobDetail.generation_metrics.length > 0 ? (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary>Generation metrics ({jobDetail.generation_metrics.length} calls)</summary>
                  <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '12rem' }}>
                    {JSON.stringify(jobDetail.generation_metrics, null, 2)}
                  </pre>
                </details>
              ) : null}
            </>
          ) : (
            <p className="text-muted">Job not found in cache (may have expired after 2 hours).</p>
          )}
        </div>
      ) : null}

      {logsLoading && !logs ? (
        <p>Loading call log…</p>
      ) : (
        <>
          <div className="admin-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Task</th>
                  <th>Feature</th>
                  <th>Model</th>
                  <th>Duration</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Cached</th>
                  <th>Cost</th>
                  <th>Book</th>
                  <th>Chapter</th>
                  <th>Attempt</th>
                  <th>Repair</th>
                  <th>Pipeline</th>
                  <th>Max tokens</th>
                  <th>QA Validator</th>
                  <th>Job ID</th>
                </tr>
              </thead>
              <tbody>
                {(logs?.items || []).map((row) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td>{row.email}</td>
                    <td><code>{row.task}</code></td>
                    <td>{row.feature_type || '—'}</td>
                    <td style={{ fontSize: '0.75rem' }}>{row.model}</td>
                    <td>{fmtMs(row.duration_ms)}</td>
                    <td>{fmtTokens(row.input_tokens)}</td>
                    <td>{fmtTokens(row.output_tokens)}</td>
                    <td>{fmtTokens(row.cached_tokens)}</td>
                    <td>{fmtCost(row.estimated_cost_usd)}</td>
                    <td>{row.book_title || '—'}</td>
                    <td>{row.call_metadata?.chapter || '—'}</td>
                    <td>{row.call_metadata?.attempt ?? '—'}</td>
                    <td>{row.call_metadata?.repair_mode || '—'}</td>
                    <td style={{ fontSize: '0.7rem' }}>{row.call_metadata?.pipeline_version || '—'}</td>
                    <td>{row.call_metadata?.max_tokens_requested ?? '—'}</td>
                    <td>{row.call_metadata?.validator_failure || '—'}</td>
                    <td
                      style={{ fontSize: '0.7rem', maxWidth: '8rem', overflow: 'hidden', textOverflow: 'ellipsis', cursor: row.celery_task_id ? 'pointer' : 'default' }}
                      title={row.celery_task_id || undefined}
                      onClick={() => {
                        if (row.celery_task_id) {
                          setJobFilter(row.celery_task_id);
                          setLogOffset(0);
                        }
                      }}
                    >
                      {row.celery_task_id || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalLogPages > 1 ? (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={logOffset <= 0}
                onClick={() => setLogOffset((o) => Math.max(0, o - logLimit))}
              >
                Previous
              </button>
              <span className="text-muted">
                Page {currentLogPage} of {totalLogPages}
              </span>
              <button
                type="button"
                disabled={logOffset + logLimit >= (logs?.total || 0)}
                onClick={() => setLogOffset((o) => o + logLimit)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
