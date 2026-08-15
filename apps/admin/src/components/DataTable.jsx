export default function DataTable({
  columns,
  rows,
  page,
  total,
  size,
  onPageChange,
  renderActions,
  onRowClick,
}) {
  const paginated = typeof onPageChange === 'function' && size > 0;
  const totalPages = paginated ? Math.max(1, Math.ceil(total / size)) : 1;

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            {renderActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (renderActions ? 1 : 0)} className="empty-cell">
                No results
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onRowClick(row); } : undefined} tabIndex={onRowClick ? 0 : undefined} className={onRowClick ? 'clickable-row' : undefined}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                {renderActions && <td>{renderActions(row)}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {paginated && (
        <div className="table-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
