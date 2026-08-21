// @ts-nocheck
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import PricingPlans from "@/components/billing/PricingPlans";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  cancelSubscriptionAtPeriodEnd,
  fetchEntitlementsSnapshot,
} from "@/lib/billing";
import { getApiErrorMessage } from "@/lib/apiError";
import { PLAN_ORDER, planLabelFromSlug } from "@/lib/plans";
import { useAuth } from "@/lib/AuthContext";

export default function Pricing() {
  const { toast } = useToast();
  const [loadingCancel, setLoadingCancel] = useState(false);
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedPlan = searchParams.get("plan");
  const requestedInterval = searchParams.get("interval");
  const initialPlan = PLAN_ORDER.includes(requestedPlan) ? requestedPlan : null;
  const initialInterval = requestedInterval === "monthly" || requestedInterval === "annual" ? requestedInterval : null;

  const { data: entitlements, refetch: refetchEntitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated,
  });

  const onCancel = async () => {
    setLoadingCancel(true);
    try {
      await cancelSubscriptionAtPeriodEnd();
      await refetchEntitlements();
      toast({
        title: "Cancellation scheduled",
        description:
          "Your subscription will end at period close. Access remains active until then.",
      });
    } catch (err) {
      toast({
        title: "Cancellation failed",
        description: getApiErrorMessage(err, "Could not cancel subscription."),
        variant: "destructive",
      });
    } finally {
      setLoadingCancel(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      <div className="rounded-[32px] border border-border/70 bg-gradient-to-br from-background via-background to-primary/[0.05] px-6 py-10 shadow-sm sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Pricing
          </div>
          <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Pick the plan that matches how often you study
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            Clean monthly pricing, clear feature differences, and Stripe
            checkout matched to the right plan. Existing books and flashcards
            remain viewable even if you change plans later.
          </p>
        </div>
      </div>

      <PricingPlans initialPlan={initialPlan} initialInterval={initialInterval} />

      {entitlements?.subscription_status &&
      entitlements.subscription_status !== "free" ? (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-medium">
              {planLabelFromSlug(entitlements.plan_slug)} ·{" "}
              {entitlements.subscription_status}
            </p>
            <p className="text-sm text-muted-foreground">
              One-tap cancellation at period end. No support contact required.
            </p>
          </div>
          <Button variant="outline" onClick={onCancel} disabled={loadingCancel}>
            {loadingCancel ? "Scheduling…" : "Cancel at period end"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
