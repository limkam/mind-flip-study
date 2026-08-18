import { lazy, Suspense, useEffect, useRef } from "react";
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
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { GenerationJobProvider } from "@/lib/GenerationJobContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import client from "@/api/client";
import { flushPendingProgress } from "@/lib/offlineCache";
import { useQuery } from "@tanstack/react-query";
import { fetchEntitlementsSnapshot } from "@/lib/billing";

import AppLayout from "./components/layout/AppLayout";
import AppShellSkeleton from "./components/layout/AppShellSkeleton";
import { routeModules } from "@/lib/routeModules";
import UpgradeLimitDialog from "@/components/billing/UpgradeLimitDialog";
import { CelebrationProvider } from "@/lib/celebrations/CelebrationContext";
import CelebrationTestHarness from "@/components/celebrations/CelebrationTestHarness";

const pages = Object.fromEntries(Object.entries(routeModules).map(([name, loader]) => [name, lazy(loader)]));
const PageNotFound = lazy(() => import("./lib/PageNotFound"));

function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppShellSkeleton />;
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
    return <AppShellSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user && user.onboarding_completed === false) {
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
  const { dashboard: Dashboard, library: Library, bookDetail: BookDetail, studySession: StudySession,
    flashcardSets: FlashcardSets, quizHistory: QuizHistory, quizResultDetail: QuizResultDetail,
    analytics: Analytics, billingUsage: BillingUsage, settings: Settings, userManagement: UserManagement,
    profile: Profile, quizChallenges: QuizChallenges, folders: Folders, leaderboard: Leaderboard,
    challengeLeaderboard: ChallengeLeaderboard, studyGroups: StudyGroups, studyGroupDetail: StudyGroupDetail,
    sharedStudySession: SharedStudySession,
    dailyReview: DailyReview, achievements: Achievements, scorecards: Scorecards, feedback: Feedback,
    guide: UserGuide, pricing: Pricing, onboarding: Onboarding, login: Login,
    emailVerification: EmailVerification, billingSuccess: BillingSuccess, creditBillingSuccess: CreditBillingSuccess, billingCancel: BillingCancel,
    mobileBillingSuccess: MobileBillingSuccess, mobileBillingCancel: MobileBillingCancel,
    mobileCreditBillingSuccess: MobileCreditBillingSuccess, mobileCreditBillingCancel: MobileCreditBillingCancel } = pages;
  return (
    <Suspense fallback={<AppShellSkeleton routeOnly />}><Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/email/verify" element={<EmailVerification />} />
      {import.meta.env.DEV && <Route path="/__phase4-test" element={<CelebrationTestHarness />} />}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      <Route path="/auth/reset-password" element={<Navigate to="/login" replace />} />
      <Route path="/billing/success" element={<BillingSuccess />} />
      <Route path="/billing/credits/success" element={<CreditBillingSuccess />} />
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
            <Route path="/study-groups/:groupId/materials/:materialId/study" element={<SharedStudySession />} />
            <Route path="/daily-review" element={<DailyReview />} />
            <Route path="/guide" element={<UserGuide />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/billing" element={<BillingUsage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes></Suspense>
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
