import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Layered on top of ProtectedRoute's isAuthenticated check — gates a route by admin_role
// (owner/finance/support/marketer). Every Owner Console module route is owner-only for now;
// swapping in the real per-module role mapping later is a one-line `roles` prop change.
export default function RequireAdminRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.admin_role)) return <Navigate to="/users" replace />;
  return children;
}
