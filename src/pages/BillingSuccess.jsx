import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, AlertCircle, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { fetchBillingOverview, verifyCheckoutSession } from "@/lib/billing";
import { classifyCheckoutVerification, isValidCheckoutSessionId } from "@/lib/checkoutVerification";
import { useApplyColorScheme } from "@/lib/colorScheme";
import { formatUsd, planLabelFromSlug } from "@/lib/plans";

const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;
const REDIRECT_SECONDS = 3;

export default function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  useApplyColorScheme(user);
  const [state, setState] = useState("verifying");
  const [details, setDetails] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const sessionId = (searchParams.get("session_id") || "").trim();
  // refreshUser() below flips the app-wide auth isLoading flag, which is also
  // this effect's own dependency — without these refs, that self-triggered
  // re-run tears down the in-flight verification (cancelled=true) right as it
  // was about to report success, so the page never leaves "processing".
  const hasStartedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    if (isLoading) return undefined;
    if (!isAuthenticated || !isValidCheckoutSessionId(sessionId)) {
      setState("error");
      return undefined;
    }
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;
    cancelledRef.current = false;
    const run = async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelledRef.current; attempt += 1) {
        try {
          const result = await verifyCheckoutSession(sessionId);
          const verificationState = classifyCheckoutVerification(result, "subscription");
          if (verificationState === "success") {
            const [, , , , overview] = await Promise.all([
              refreshUser(),
              queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-overview"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
              fetchBillingOverview().catch(() => null),
            ]);
            await queryClient.invalidateQueries({ queryKey: ["billing-payment-method"] });
            if (!cancelledRef.current) {
              setDetails({
                planLabel: planLabelFromSlug(result.plan_slug),
                amountCents: overview?.subscription?.amount_cents ?? null,
                currentPeriodEnd: overview?.subscription?.current_period_end ?? null,
              });
              setState("success");
            }
            return;
          }
          if (verificationState === "error") {
            setState("error");
            return;
          }
          setState("processing");
        } catch {
          if (attempt === MAX_ATTEMPTS - 1 && !cancelledRef.current) setState("error");
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      }
    };
    void run();
    return undefined;
  }, [isAuthenticated, isLoading, queryClient, refreshUser, sessionId]);

  useEffect(() => {
    hasStartedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (state !== "success") return undefined;
    setSecondsLeft(REDIRECT_SECONDS);
    const tick = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    const redirect = setTimeout(() => navigate("/", { replace: true }), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(redirect);
    };
  }, [state, navigate]);

  const success = state === "success";
  const processing = state === "verifying" || state === "processing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
      >
        {success ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : processing ? <Clock3 className="h-9 w-9 text-primary" /> : <AlertCircle className="h-9 w-9 text-destructive" />}
      </motion.div>
      <h1 className="font-heading text-3xl font-bold">
        {success ? "Subscription activated" : processing ? "Payment is processing" : "We couldn't verify this payment"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {success
          ? details?.planLabel
            ? `You're on the ${details.planLabel} plan now.`
            : "Stripe and your MindFlip account both confirm that your subscription is active."
          : processing
            ? "Stripe checkout is complete, but your account is still being synchronized. This page will check again briefly."
            : "The link may be missing, invalid, expired, or belong to a different account. No access was granted from this page."}
      </p>
      {success && (details?.amountCents != null || details?.currentPeriodEnd) && (
        <div className="mt-4 w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-muted-foreground">
          {details?.amountCents != null && (
            <p>
              You were charged <strong className="text-foreground">{formatUsd(details.amountCents)}</strong>.
            </p>
          )}
          {details?.currentPeriodEnd && (
            <p className="mt-1">
              Renews on{" "}
              <strong className="text-foreground">
                {new Date(details.currentPeriodEnd).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </strong>
              .
            </p>
          )}
        </div>
      )}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link to={isAuthenticated ? "/" : "/login"}>
            <Sparkles className="h-4 w-4" />
            {success ? `Continue to dashboard${secondsLeft > 0 ? ` (${secondsLeft})` : ""}` : isAuthenticated ? "Return to account" : "Sign in to continue"}
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to={isAuthenticated ? "/billing" : "/login"}>
            {isAuthenticated ? "View billing" : "Return to sign in"}
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
