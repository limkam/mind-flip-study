import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { fetchEntitlementsSnapshot, verifyCheckoutSession } from "@/lib/billing";
import { classifyCheckoutVerification, isValidCheckoutSessionId } from "@/lib/checkoutVerification";
import { useApplyColorScheme } from "@/lib/colorScheme";
import { formatUsd } from "@/lib/plans";

const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;
const REDIRECT_SECONDS = 3;

export default function CreditBillingSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  useApplyColorScheme(user);
  const [state, setState] = useState("verifying");
  const [details, setDetails] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const sessionId = (searchParams.get("session_id") || "").trim();

  useEffect(() => {
    if (isLoading) return undefined;
    if (!isAuthenticated || !isValidCheckoutSessionId(sessionId)) {
      setState("error");
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt += 1) {
        try {
          const result = await verifyCheckoutSession(sessionId);
          const verificationState = classifyCheckoutVerification(result, "credit_purchase");
          if (verificationState === "success") {
            const [, , entitlements] = await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-overview"] }),
              fetchEntitlementsSnapshot().catch(() => null),
            ]);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["credit-usage"] }),
              queryClient.invalidateQueries({ queryKey: ["credit-purchase-history"] }),
            ]);
            if (!cancelled) {
              setDetails({
                quantity: result.credit_quantity ?? null,
                amountCents: result.credit_quantity != null && result.unit_price_cents != null
                  ? result.credit_quantity * result.unit_price_cents
                  : null,
                purchasedBalance: entitlements?.balances?.purchased_credits ?? null,
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
          if (attempt === MAX_ATTEMPTS - 1 && !cancelled) setState("error");
        }
        if (attempt < MAX_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, queryClient, sessionId]);

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
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
      >
        {success ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : processing ? <Clock3 className="h-9 w-9 text-primary" /> : <AlertCircle className="h-9 w-9 text-destructive" />}
      </motion.div>
      <h1 className="font-heading text-3xl font-bold">{success ? "Credits added" : processing ? "Payment is processing" : "We couldn't verify this purchase"}</h1>
      <p className="mt-3 text-muted-foreground">
        {success
          ? details?.quantity != null
            ? `${details.quantity} credit${details.quantity === 1 ? "" : "s"} were added to your account.`
            : "The paid Stripe Checkout Session has been fulfilled and your credits are recorded."
          : processing
            ? "Stripe has completed checkout, but the credit grant is still being recorded. This page will check again briefly."
            : "The link may be missing, invalid, expired, or belong to another account. No credits were granted from this page."}
      </p>
      {success && (details?.amountCents != null || details?.purchasedBalance != null) && (
        <div className="mt-4 w-full rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          {details?.amountCents != null && (
            <p>
              You were charged <strong className="text-foreground">{formatUsd(details.amountCents)}</strong>.
            </p>
          )}
          {details?.purchasedBalance != null && (
            <p className="mt-1">
              Purchased credit balance: <strong className="text-foreground">{details.purchasedBalance}</strong>
            </p>
          )}
        </div>
      )}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link to={isAuthenticated ? "/" : "/login"}>
            {success ? `Continue to dashboard${secondsLeft > 0 ? ` (${secondsLeft})` : ""}` : isAuthenticated ? "Return to account" : "Sign in to continue"}
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to={isAuthenticated ? "/billing" : "/login"}>{isAuthenticated ? "View billing and credits" : "Sign in to continue"}</Link>
        </Button>
      </div>
    </motion.div>
  );
}
