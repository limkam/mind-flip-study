import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { GenerationJobProvider } from "@/lib/GenerationJobContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import client from "@/api/client";
import { flushPendingProgress } from "@/lib/offlineCache";
import { useQuery } from "@tanstack/react-query";
import { fetchEntitlementsSnapshot } from "@/lib/billing";

import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import BookDetail from "./pages/BookDetail";
import StudySession from "./pages/StudySession";
import FlashcardSets from "./pages/FlashcardSets";
import QuizHistory from "./pages/QuizHistory";
import UserManagement from "./pages/UserManagement";
import Profile from "./pages/Profile";
import QuizChallenges from "./pages/QuizChallenges";
import Settings from "./pages/Settings";
import Folders from "./pages/Folders";
import Analytics from "./pages/Analytics";
import Leaderboard from "./pages/Leaderboard";
import ChallengeLeaderboard from "./pages/ChallengeLeaderboard";
import StudyGroups from "./pages/StudyGroups";
import StudyGroupDetail from "./pages/StudyGroupDetail";
import DailyReview from "./pages/DailyReview";
import Achievements from "./pages/Achievements";
import QuizResultDetail from "./pages/QuizResultDetail";
import Login from "./pages/Login";
import EmailVerification from "./pages/EmailVerification";
import Scorecards from "./pages/Scorecards";
import BillingSuccess from "./pages/BillingSuccess";
import BillingCancel from "./pages/BillingCancel";
import MobileBillingSuccess from "./pages/MobileBillingSuccess";
import MobileBillingCancel from "./pages/MobileBillingCancel";
import MobileCreditBillingSuccess from "./pages/MobileCreditBillingSuccess";
import MobileCreditBillingCancel from "./pages/MobileCreditBillingCancel";
import Pricing from "./pages/Pricing";
import BillingUsage from "./pages/BillingUsage";
import Onboarding from "./pages/Onboarding";
import Feedback from "./pages/Feedback";
import UpgradeLimitDialog from "@/components/billing/UpgradeLimitDialog";
import { CelebrationProvider } from "@/lib/celebrations/CelebrationContext";
import CelebrationTestHarness from "@/components/celebrations/CelebrationTestHarness";

function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
          <p className="text-sm font-medium text-muted-foreground">Loading…</p>
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user && user.onboarding_completed === false && location.pathname !== "/") {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function RequireFeature({ feature, children }) {
  const prompted = useRef(false);
  const { data: entitlements, isLoading } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });

  const isAllowed = entitlements?.features?.[feature] === true;
  useEffect(() => {
    if (!isLoading && !isAllowed && !prompted.current) {
      prompted.current = true;
      window.dispatchEvent(new CustomEvent("mindflip:plan-limit", {
        detail: { reason: "This feature is not included in your current plan." },
      }));
    }
  }, [isAllowed, isLoading]);

  if (isLoading) return null;
  if (!isAllowed) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/email/verify" element={<EmailVerification />} />
      {import.meta.env.DEV && <Route path="/__phase4-test" element={<CelebrationTestHarness />} />}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      <Route path="/auth/reset-password" element={<Navigate to="/login" replace />} />
      <Route path="/billing/success" element={<BillingSuccess />} />
      <Route path="/billing/credits/success" element={<BillingSuccess />} />
      <Route path="/billing/cancel" element={<BillingCancel />} />
      <Route path="/billing/credits/cancel" element={<BillingCancel />} />
      <Route path="/mobile/billing/success" element={<MobileBillingSuccess />} />
      <Route path="/mobile/billing/credits/success" element={<MobileCreditBillingSuccess />} />
      <Route path="/mobile/billing/cancel" element={<MobileBillingCancel />} />
      <Route path="/mobile/billing/credits/cancel" element={<MobileCreditBillingCancel />} />
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
            <Route path="/quiz-results/:id" element={<QuizResultDetail />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/challenges" element={<RequireFeature feature="challenges"><QuizChallenges /></RequireFeature>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/folders" element={<Folders />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/scorecards" element={import.meta.env.VITE_ENGAGEMENT_SCORECARDS_ENABLED === "false" ? <Navigate to="/" replace /> : <Scorecards />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route
              path="/challenge-leaderboard"
              element={<RequireFeature feature="challenges"><ChallengeLeaderboard /></RequireFeature>}
            />
            <Route path="/study-groups" element={<StudyGroups />} />
            <Route path="/study-groups/:id" element={<StudyGroupDetail />} />
            <Route path="/daily-review" element={<DailyReview />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/billing" element={<BillingUsage />} />
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
    window.addEventListener("online", onOnline);
    if (navigator.onLine) {
      void flushPendingProgress(client);
    }
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <GenerationJobProvider>
            <CelebrationProvider>
              <UpgradeLimitDialog />
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
              <InstallPrompt />
              <Toaster />
            </CelebrationProvider>
          </GenerationJobProvider>
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
