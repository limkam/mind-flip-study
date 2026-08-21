import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, Loader2, Mail, Sparkles } from "lucide-react";

import client from "@/api/client";
import { BilkeysBrand } from "@/components/brand/BilkeysLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";
import { PLAN_ORDER } from "@/lib/plans";

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleOAuthEnabled = Boolean(
    googleClientId
    && import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true",
  );

export default function Login() {
  const { loginWithGoogle, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const resolveDestination = () => {
    const from = location.state?.from;
    if (from?.pathname) {
      return { pathname: from.pathname, search: from.search || "" };
    }
    const plan = searchParams.get("plan");
    const interval = searchParams.get("interval");
    if (plan && PLAN_ORDER.includes(plan) && (interval === "monthly" || interval === "annual")) {
      return { pathname: "/pricing", search: `?plan=${plan}&interval=${interval}` };
    }
    return { pathname: "/", search: "" };
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(resolveDestination(), { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const continueWithEmail = async (event) => {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await client.post("/auth/email/start", {
        email: normalizedEmail,
      });
      navigate("/auth/email/verify", {
        state: {
          email: normalizedEmail,
          challengeId: data.challenge_id,
          resendAfter: data.resend_after,
          destination: resolveDestination(),
        },
      });
    } catch (error) {
      toast({
        title: "Could not send code",
        description: getApiErrorMessage(error, "Please try again shortly."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (!credentialResponse.credential) {
      toast({ title: "Google sign-in failed", description: "No credential returned.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await loginWithGoogle(credentialResponse.credential, true);
      navigate(resolveDestination(), { replace: true });
    } catch (error) {
      toast({
        title: "Google sign-in failed",
        description: getApiErrorMessage(error, "Google sign-in failed."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-between">
        <img
          src="/login-learning-hero.webp"
          alt="Student studying in a library"
          className="absolute inset-0 h-full w-full object-cover object-[42%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07172d]/55 via-[#07172d]/20 to-[#07172d]/90" />

        <div className="relative z-10 p-10 xl:p-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-white shadow-sm backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            Learn smarter, every day
          </div>
        </div>

        <div className="relative z-10 max-w-2xl p-10 text-white xl:p-14">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="max-w-xl font-heading text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Turn what you study into what you remember.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/75">
            Build focused study sessions, review with intelligent flashcards, and make steady progress toward your goals.
          </p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/90">
            {["Focused study tools", "Progress that stays visible", "Built for every subject"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12">
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-amber-200/25 blur-3xl" />

        <div className="relative w-full max-w-md">
          <div className="mb-9">
            <BilkeysBrand className="mb-10" surface="on-light" />
            <p className="mb-2 text-sm font-semibold text-primary">
              {authMode === "signup" ? "Start your journey" : "Welcome back"}
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {authMode === "signup" ? "Create your account" : "Sign in to Bilkeys"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {authMode === "signup" ? "Create an account and make every study session count." : "Pick up where you left off and keep your momentum going."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.3)] sm:p-7">
            <div className="space-y-5">
          <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1" aria-label="Authentication mode">
            {[
              ["signin", "Sign in"],
              ["signup", "Sign up"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAuthMode(value)}
                className={`h-10 rounded-md text-sm font-semibold transition-all ${authMode === value ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={authMode === value}
              >
                {label}
              </button>
            ))}
          </div>

          {googleOAuthEnabled ? (
            <div className="flex min-h-10 justify-center [&>div]:w-full">
              <GoogleLogin
                width={352}
                type="standard"
                theme="outline"
                size="large"
                text={authMode === "signup" ? "signup_with" : "continue_with"}
                shape="rectangular"
                logo_alignment="left"
                onSuccess={handleGoogleSuccess}
                onError={() => toast({ title: "Google sign-in failed", description: "Please try again.", variant: "destructive" })}
                useOneTap={false}
              />
            </div>
          ) : null}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
              <span className="uppercase tracking-[0.16em]">or continue with email</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-4" onSubmit={continueWithEmail}>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 rounded-lg border-slate-200 bg-slate-50/70 pl-10 transition-colors focus:bg-white"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
            <Button type="submit" className="h-12 w-full rounded-lg font-semibold shadow-sm" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Continue with Email
              {!busy ? <ArrowRight className="ml-auto h-4 w-4" /> : null}
            </Button>
          </form>
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            By continuing, you agree to Bilkeys&apos;s Terms of Service and Privacy Policy.
          </p>
        </div>
      </section>
    </main>
  );
}
