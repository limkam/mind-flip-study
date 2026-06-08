import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Users from './pages/Users';
import Feedback from './pages/Feedback';
import Content from './pages/Content';
import Metrics from './pages/Metrics';
import PlatformStats from './pages/PlatformStats';
import AppMonitoring from './pages/AppMonitoring';
import Demographics from './pages/Demographics';
import FinancialAnalytics from './pages/FinancialAnalytics';

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
        <Route path="users" element={<Users />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="content" element={<Content />} />
        <Route path="metrics" element={<Metrics />} />
        <Route path="admin/platform-stats" element={<PlatformStats />} />
        <Route path="admin/app-monitoring" element={<AppMonitoring />} />
        <Route path="admin/demographics" element={<Demographics />} />
        <Route path="admin/financial-analytics" element={<FinancialAnalytics />} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
