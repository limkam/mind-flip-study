import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RequireAdminRole from './components/RequireAdminRole';
import Login from './pages/Login';
const Users = lazy(() => import('./pages/Users'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Content = lazy(() => import('./pages/Content'));
const Metrics = lazy(() => import('./pages/Metrics'));
const PlatformStats = lazy(() => import('./pages/PlatformStats'));
const AppMonitoring = lazy(() => import('./pages/AppMonitoring'));
const Demographics = lazy(() => import('./pages/Demographics'));
const FinancialAnalytics = lazy(() => import('./pages/FinancialAnalytics'));
const AiUsageAnalytics = lazy(() => import('./pages/AiUsageAnalytics'));
const controlPage = (name) => lazy(() => import('./pages/ControlCenterPages').then(module => ({ default: module[name] })));
const Overview = controlPage('Overview');
const UserDetail = controlPage('UserDetail');
const Subscriptions = controlPage('Subscriptions');
const BillingOperations = controlPage('BillingOperations');
const CreditMonitoring = controlPage('CreditMonitoring');
const LearningActivity = controlPage('LearningActivity');
// Temporarily hidden until the activity analytics experience is redesigned.
// const ActivityAnalytics = controlPage('ActivityAnalytics');
const LeaderboardMonitoring = controlPage('LeaderboardMonitoring');
const Security = controlPage('Security');
const AuditLog = controlPage('AuditLog');
const ContentDetail = controlPage('ContentDetail');
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const RevenueDashboard = lazy(() => import('./pages/RevenueDashboard'));
const CashDashboard = lazy(() => import('./pages/CashDashboard'));
const UnitEconomicsDashboard = lazy(() => import('./pages/UnitEconomicsDashboard'));
const RetentionDashboard = lazy(() => import('./pages/RetentionDashboard'));
const AttributionDashboard = lazy(() => import('./pages/AttributionDashboard'));
const TechnicalDashboard = lazy(() => import('./pages/TechnicalDashboard'));
const ComplianceDashboard = lazy(() => import('./pages/ComplianceDashboard'));
const AlertsDashboard = lazy(() => import('./pages/AlertsDashboard'));
const GovernanceDashboard = lazy(() => import('./pages/GovernanceDashboard'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<Navigate to="/users" replace />} />
        <Route element={<Suspense fallback={<div className="page-loading">Loading section…</div>}><Outlet /></Suspense>}>
        <Route path="overview" element={<Overview />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="billing" element={<BillingOperations />} />
        <Route path="credits" element={<CreditMonitoring />} />
        <Route path="learning" element={<LearningActivity />} />
        {/* <Route path="analytics" element={<ActivityAnalytics />} /> */}
        <Route path="leaderboards" element={<LeaderboardMonitoring />} />
        <Route path="security" element={<Security />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="support" element={<Feedback />} />
        <Route path="content" element={<Content />} />
        <Route path="content/:id" element={<ContentDetail />} />
        <Route path="metrics" element={<Metrics />} />
        <Route path="admin/platform-stats" element={<PlatformStats />} />
        <Route path="admin/app-monitoring" element={<AppMonitoring />} />
        <Route path="system-health" element={<AppMonitoring />} />
        <Route path="admin/demographics" element={<Demographics />} />
        <Route path="admin/financial-analytics" element={<FinancialAnalytics />} />
        <Route path="admin/ai-usage" element={<AiUsageAnalytics />} />
        <Route path="ai-usage" element={<AiUsageAnalytics />} />
        <Route path="admin/owner-dashboard" element={<OwnerDashboard />} />
        <Route path="owner-dashboard" element={<OwnerDashboard />} />
        <Route path="admin/revenue" element={<RequireAdminRole roles={['owner']}><RevenueDashboard /></RequireAdminRole>} />
        <Route path="admin/cash" element={<RequireAdminRole roles={['owner']}><CashDashboard /></RequireAdminRole>} />
        <Route path="admin/unit-economics" element={<RequireAdminRole roles={['owner']}><UnitEconomicsDashboard /></RequireAdminRole>} />
        <Route path="admin/retention" element={<RequireAdminRole roles={['owner']}><RetentionDashboard /></RequireAdminRole>} />
        <Route path="admin/attribution" element={<RequireAdminRole roles={['owner']}><AttributionDashboard /></RequireAdminRole>} />
        <Route path="admin/technical" element={<RequireAdminRole roles={['owner']}><TechnicalDashboard /></RequireAdminRole>} />
        <Route path="admin/compliance" element={<RequireAdminRole roles={['owner']}><ComplianceDashboard /></RequireAdminRole>} />
        <Route path="admin/alerts" element={<RequireAdminRole roles={['owner']}><AlertsDashboard /></RequireAdminRole>} />
        <Route path="admin/governance" element={<RequireAdminRole roles={['owner']}><GovernanceDashboard /></RequireAdminRole>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
