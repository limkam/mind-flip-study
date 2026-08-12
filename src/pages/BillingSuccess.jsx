import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, AlertCircle, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { verifyCheckoutSession } from "@/lib/billing";
import { classifyCheckoutVerification, isValidCheckoutSessionId } from "@/lib/checkoutVerification";

const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;

export default function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState("verifying");
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
          const verificationState = classifyCheckoutVerification(result, "subscription");
          if (verificationState === "success") {
            await Promise.all([
              refreshUser(),
              queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-overview"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-payment-method"] }),
            ]);
            if (!cancelled) setState("success");
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
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, queryClient, refreshUser, sessionId]);

  const success = state === "success";
  const processing = state === "verifying" || state === "processing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        {success ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : processing ? <Clock3 className="h-9 w-9 text-primary" /> : <AlertCircle className="h-9 w-9 text-destructive" />}
      </div>
      <h1 className="font-heading text-3xl font-bold">
        {success ? "Subscription activated" : processing ? "Payment is processing" : "We couldn't verify this payment"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {success
          ? "Stripe and your MindFlip account both confirm that your subscription is active."
          : processing
            ? "Stripe checkout is complete, but your account is still being synchronized. This page will check again briefly."
            : "The link may be missing, invalid, expired, or belong to a different account. No access was granted from this page."}
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link to={isAuthenticated ? "/" : "/login"}>
            <Sparkles className="h-4 w-4" />
            {success ? "Start studying" : isAuthenticated ? "Return to account" : "Sign in to continue"}
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
