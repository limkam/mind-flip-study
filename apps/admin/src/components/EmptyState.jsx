export default function EmptyState({ message = 'No data yet' }) {
  return <p className="empty-state">{message}</p>;
}
