export function PageHeader({ title, description, actions }) {
  return <header className="cc-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="cc-page-actions">{actions}</div>}</header>;
}

export function SectionCard({ title, description, actions, children, className = '' }) {
  return <section className={`cc-section ${className}`}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</header>{children}</section>;
}

export function StatusBadge({ value = 'unknown', tone }) {
  const text = String(value).replaceAll('_', ' ');
  const resolved = tone || (/healthy|active|paid|success|resolved/i.test(text) ? 'positive' : /failed|error|banned|conflict|past due|critical/i.test(text) ? 'critical' : /trial|warning|cancel|processing|ending|degraded/i.test(text) ? 'warning' : 'neutral');
  return <span className={`status-badge ${resolved}`}>{text}</span>;
}

export function EmptyState({ title = 'No results', description = 'There is nothing to review here right now.' }) {
  return <div className="cc-empty"><strong>{title}</strong><p>{description}</p></div>;
}

export function DetailRows({ rows }) {
  return <dl className="detail-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

export function QueryState({ query, label = 'operational data' }) {
  if (query.isLoading) return <div className="loading-skeleton" aria-label={`Loading ${label}`}><span /><span /><span /></div>;
  if (!query.isError) return null;
  const status = query.error?.response?.status;
  const message = status === 401 ? 'Your admin session has expired.' : status === 403 ? 'You do not have permission to view this section.' : status === 404 ? 'This service is unavailable in the current API version.' : status >= 500 ? `The server could not load ${label}.` : !query.error?.response ? 'The MindFlip API could not be reached.' : `We could not load ${label}.`;
  return <div className="fetch-error-banner" role="alert"><div><strong>{message}</strong>{query.error?.response?.headers?.['x-request-id'] && <small>Request ID: {query.error.response.headers['x-request-id']}</small>}</div><button type="button" onClick={() => query.refetch()}>Retry</button></div>;
}
