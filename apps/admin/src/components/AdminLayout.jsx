import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const nav = [
  { group: 'Main', items: [{ to: '/overview', label: 'Overview', icon: '◈' }, { to: '/users', label: 'Users', icon: '◎' }, { to: '/admin/demographics', label: 'Demographics', icon: '⚆' }, { to: '/content', label: 'Content', icon: '▤' }] },
  { group: 'Business', items: [{ to: '/subscriptions', label: 'Subscriptions', icon: '◇' }, { to: '/billing', label: 'Billing', icon: '£' }, { to: '/credits', label: 'Usage & Credits', icon: '◉' }, { to: '/admin/financial-analytics', label: 'Financial Analytics', icon: '$' }] },
  {
    group: 'Engagement',
    items: [
      // Temporarily hidden until the activity analytics experience is redesigned.
      // { to: '/analytics', label: 'Analytics', icon: '∿' },
      { to: '/metrics', label: 'Metrics', icon: '▥' },
      { to: '/admin/platform-stats', label: 'Platform Statistics', icon: '▦' },
      { to: '/learning', label: 'Learning', icon: '△' },
      { to: '/leaderboards', label: 'Leaderboards', icon: '☆' },
    ],
  },
  { group: 'Operations', items: [{ to: '/ai-usage', label: 'AI Usage', icon: '✦' }, { to: '/support', label: 'Support', icon: '▭' }, { to: '/system-health', label: 'System Health', icon: '●' }] },
  { group: 'Administration', items: [{ to: '/security', label: 'Security', icon: '▣' }, { to: '/audit-log', label: 'Audit Log', icon: '≡' }] },
  { group: 'Executive', items: [{ to: '/owner-dashboard', label: 'Owner Dashboard', icon: '◆' }] },
  {
    group: 'Owner Console',
    items: [
      { to: '/admin/revenue', label: 'Revenue', icon: '◈', allowedRoles: ['owner'] },
      { to: '/admin/cash', label: 'Cash', icon: '£', allowedRoles: ['owner'] },
      { to: '/admin/unit-economics', label: 'Unit Economics', icon: '÷', allowedRoles: ['owner'] },
      { to: '/admin/retention', label: 'Retention', icon: '↻', allowedRoles: ['owner'] },
      { to: '/admin/attribution', label: 'Attribution', icon: '→', allowedRoles: ['owner'] },
      { to: '/admin/technical', label: 'Technical', icon: '⚙', allowedRoles: ['owner'] },
      { to: '/admin/compliance', label: 'Compliance', icon: '⚖', allowedRoles: ['owner'] },
      { to: '/admin/alerts', label: 'Alerts', icon: '🔔', allowedRoles: ['owner'] },
      { to: '/admin/governance', label: 'Governance', icon: '§', allowedRoles: ['owner'] },
    ],
  },
];

// Items with no `allowedRoles` are visible to every admin, matching today's behavior.
// Items with `allowedRoles` are only shown when the signed-in admin's admin_role is listed.
function visibleItems(items, adminRole) {
  return items.filter((item) => !item.allowedRoles || item.allowedRoles.includes(adminRole));
}

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo"><span><em>B</em></span><div>Bilkeys<small>Control Center</small></div></div>
        <nav className="admin-nav">
          {nav.map((section) => {
            const items = visibleItems(section.items, user?.admin_role);
            if (items.length === 0) return null;
            return <div className="admin-nav-group" key={section.group}>
              <div className="admin-nav-heading">{section.group}</div>
              {items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</NavLink>)}
            </div>;
          })}
        </nav>
        <div className="admin-account"><div><strong>{user?.full_name || 'Administrator'}</strong><small>{user?.email}</small></div><button type="button" className="admin-logout" onClick={logout}>Log out</button></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span className="admin-badge"><i /> Operational console</span>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
