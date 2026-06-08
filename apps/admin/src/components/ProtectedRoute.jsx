import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <p className="loading-center">Loading…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
