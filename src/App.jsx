import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { GenerationJobProvider } from '@/lib/GenerationJobContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import InstallPrompt from '@/components/InstallPrompt';
import client from '@/api/client';
import { flushPendingProgress } from '@/lib/offlineCache';

import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import BookDetail from './pages/BookDetail';
import StudySession from './pages/StudySession';
import FlashcardSets from './pages/FlashcardSets';
import QuizHistory from './pages/QuizHistory';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import QuizChallenges from './pages/QuizChallenges';
import WorkbookView from './pages/WorkbookView';
import Settings from './pages/Settings';
import Folders from './pages/Folders';
import Analytics from './pages/Analytics';
import Leaderboard from './pages/Leaderboard';
import DailyReview from './pages/DailyReview';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import BillingSuccess from './pages/BillingSuccess';
import BillingCancel from './pages/BillingCancel';
import Onboarding from './pages/Onboarding';
import Feedback from './pages/Feedback';

function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function RequireOnboarding() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user && user.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<RequireOnboarding />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/study/:id" element={<StudySession />} />
          <Route path="/flashcard-sets" element={<FlashcardSets />} />
          <Route path="/quiz-history" element={<QuizHistory />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/challenges" element={<QuizChallenges />} />
          <Route path="/workbook/:id" element={<WorkbookView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/folders" element={<Folders />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/daily-review" element={<DailyReview />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/billing/cancel" element={<BillingCancel />} />
        </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function App() {
  useEffect(() => {
    const onOnline = () => {
      void flushPendingProgress(client);
    };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) {
      void flushPendingProgress(client);
    }
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <GenerationJobProvider>
          <Router>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </Router>
          <InstallPrompt />
          <Toaster />
        </GenerationJobProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
