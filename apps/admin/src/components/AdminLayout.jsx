import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const nav = [
  { to: '/users', label: 'Users' },
  { to: '/feedback', label: 'Feedback' },
  { to: '/content', label: 'Content' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/admin/platform-stats', label: 'Platform Statistics' },
  { to: '/admin/app-monitoring', label: 'App Monitoring' },
  { to: '/admin/demographics', label: 'Demographics' },
  { to: '/admin/financial-analytics', label: 'Financial Analytics' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo">MindFlip</div>
        <nav className="admin-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="admin-logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span className="admin-badge">Admin Panel</span>
          <span className="admin-user-name">{user?.full_name}</span>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
