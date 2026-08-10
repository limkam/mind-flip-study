import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { fetchEntitlementsSnapshot } from "@/lib/billing";
import { planLabelFromSlug } from "@/lib/plans";

export default function BillingSuccess() {
  const { isAuthenticated, refreshUser } = useAuth();

  useEffect(() => {
    if (isAuthenticated) void refreshUser();
  }, [isAuthenticated, refreshUser]);

  const { data: entitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const slug = query.state.data?.plan_slug;
      return !slug || slug === "free" ? 2000 : false;
    },
  });
  const tierLabel = entitlements?.plan_slug
    ? planLabelFromSlug(entitlements.plan_slug)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <h1 className="font-heading text-3xl font-bold">You&apos;re all set!</h1>
      <p className="mt-3 text-muted-foreground">
        Your payment was completed successfully
        {tierLabel && entitlements?.plan_slug !== "free" ? (
          <> and your account is now on the{" "}<span className="font-semibold text-foreground">{tierLabel}</span> plan</>
        ) : (
          <> and your subscription is activating...</>
        )}.
      </p>
      {entitlements?.plan_slug === "free" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Updating your subscription details, please wait…
        </p>
      )}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link to={isAuthenticated ? "/" : "/login"}>
            <Sparkles className="h-4 w-4" />
            {isAuthenticated ? "Start studying" : "Sign in to continue"}
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
