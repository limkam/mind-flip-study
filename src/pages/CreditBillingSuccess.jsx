import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { verifyCheckoutSession } from "@/lib/billing";
import { classifyCheckoutVerification, isValidCheckoutSessionId } from "@/lib/checkoutVerification";

const MAX_ATTEMPTS = 5;
const POLL_MS = 2000;

export default function CreditBillingSuccess() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
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
          const verificationState = classifyCheckoutVerification(result, "credit_purchase");
          if (verificationState === "success") {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] }),
              queryClient.invalidateQueries({ queryKey: ["billing-overview"] }),
              queryClient.invalidateQueries({ queryKey: ["credit-usage"] }),
              queryClient.invalidateQueries({ queryKey: ["credit-purchase-history"] }),
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
        if (attempt < MAX_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, queryClient, sessionId]);

  const success = state === "success";
  const processing = state === "verifying" || state === "processing";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        {success ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : processing ? <Clock3 className="h-9 w-9 text-primary" /> : <AlertCircle className="h-9 w-9 text-destructive" />}
      </div>
      <h1 className="font-heading text-3xl font-bold">{success ? "Credits added" : processing ? "Payment is processing" : "We couldn't verify this purchase"}</h1>
      <p className="mt-3 text-muted-foreground">
        {success
          ? "The paid Stripe Checkout Session has been fulfilled and your credits are recorded."
          : processing
            ? "Stripe has completed checkout, but the credit grant is still being recorded. This page will check again briefly."
            : "The link may be missing, invalid, expired, or belong to another account. No credits were granted from this page."}
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg"><Link to={isAuthenticated ? "/billing" : "/login"}>{isAuthenticated ? "View billing and credits" : "Sign in to continue"}</Link></Button>
        <Button asChild variant="outline" size="lg"><Link to={isAuthenticated ? "/" : "/login"}>Return to account</Link></Button>
      </div>
    </motion.div>
  );
}
