// @ts-nocheck
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchBillingPricing,
  fetchEntitlementsSnapshot,
  startCheckout,
} from "@/lib/billing";
import {
  checkoutPlanForSlug,
  formatUsd,
  priceForPlan,
  priceIdForPlan,
  PLAN_CTA_LABELS,
  PLAN_COMPARISON_ROWS,
  PLAN_HEADLINES,
  PLAN_LABELS,
  PLAN_ORDER,
  PLAN_TAGLINES,
  planLabelFromSlug,
  RECOMMENDED_PLAN_SLUG,
} from "@/lib/plans";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/apiError";
import { useAuth } from "@/lib/AuthContext";

export default function PricingPlans({ compact = false }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [interval, setInterval] = useState("monthly");
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const { data: pricing } = useQuery({
    queryKey: ["billing-pricing"],
    queryFn: fetchBillingPricing,
  });

  const { data: entitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated,
  });

  const plans = useMemo(() => {
    return PLAN_ORDER.map((slug) => ({
      slug,
      label: PLAN_LABELS[slug],
      headline: PLAN_HEADLINES[slug],
      tagline: PLAN_TAGLINES[slug],
      features: PLAN_COMPARISON_ROWS.map((row) => ({
        label: row.label,
        value: row.values[slug],
      })),
      priceCents: priceForPlan(pricing, slug, interval),
      stripePriceId: priceIdForPlan(pricing, slug, interval),
    }));
  }, [pricing, interval]);

  const currentPlan = entitlements?.plan_slug || "free";

  const onCheckout = async (slug) => {
    if (slug === "free") return;
    setLoadingPlan(slug);
    try {
      await startCheckout(checkoutPlanForSlug(slug), interval);
    } catch (err) {
      setLoadingPlan(null);
      toast({
        title: "Checkout unavailable",
        description: getApiErrorMessage(err, "Could not start checkout."),
        variant: "destructive",
      });
    }
  };

  return (
    <section className="space-y-8">
      {!compact ? (
        <div className="rounded-[32px] border border-primary/10 bg-gradient-to-br from-primary/[0.08] via-background to-background px-6 py-8 shadow-sm sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Flexible plans
              </div>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Clear plans for every level of study intensity
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Compare study volume, collaboration tools, and AI processing
                benefits side by side. Choose monthly or annual billing before
                starting the matching Stripe subscription.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/90 px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <span className="font-semibold text-foreground">
                Recommended:
              </span>{" "}
              {planLabelFromSlug(RECOMMENDED_PLAN_SLUG)} for balanced weekly
              study and group workflows.
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
          {[
            ["monthly", "Monthly"],
            ["annual", "Annual"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${interval === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid gap-6 ${compact ? "lg:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4"}`}
      >
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlan;
          const isRecommended = plan.slug === RECOMMENDED_PLAN_SLUG;
          const isFree = plan.slug === "free";
          const priceAmount = isFree
            ? "$0"
            : `${formatUsd(plan.priceCents)}`;

          return (
            <div
              key={plan.slug}
              className={`relative flex h-full min-h-[640px] flex-col rounded-lg border bg-card p-5 shadow-sm transition-all ${isRecommended ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/15" : "border-border/70"} ${isCurrent ? "bg-primary/[0.045]" : ""}`}
            >
              {isRecommended ? (
                <div className="absolute left-6 top-0 -translate-y-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground">
                  Most popular
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase text-primary/90">
                    {plan.label}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-foreground">
                    {plan.headline}
                  </h3>
                </div>
                {isCurrent ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Current
                  </span>
                ) : null}
              </div>

              <div className="mt-6">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-foreground">
                    {priceAmount}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    {interval === "annual" ? "/year" : "/month"}
                  </span>
                </div>
                <p className="mt-3 min-h-[48px] text-sm leading-6 text-muted-foreground">
                  {plan.tagline}
                </p>
              </div>

              <div className="mt-5 divide-y divide-border border-y border-border">
                {plan.features.map((feature) => (
                  <div
                    key={feature.label}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{feature.label}</span>
                    <span className={`shrink-0 text-right font-medium ${feature.value === "—" ? "text-muted-foreground" : "text-foreground"}`}>
                      {feature.value === "✓" ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600" aria-label="Included">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : feature.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-6">
                {!isFree && !isCurrent ? (
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    You&apos;ll be charged <span className="font-semibold text-foreground">{priceAmount}</span> today. Your subscription renews automatically every {interval === "annual" ? "year" : "month"} until you cancel. Cancel anytime from Billing &amp; Credits.
                  </p>
                ) : null}
                {isCurrent ? (
                  <Button disabled className="h-12 w-full rounded-xl">
                    Current plan
                  </Button>
                ) : isFree ? (
                  <Button
                    disabled
                    variant="outline"
                    className="h-12 w-full rounded-xl"
                  >
                    {PLAN_CTA_LABELS[plan.slug]}
                  </Button>
                ) : (
                  <Button
                    className="h-12 w-full rounded-xl"
                    disabled={loadingPlan === plan.slug || !plan.stripePriceId}
                    onClick={() => onCheckout(plan.slug)}
                  >
                    {loadingPlan === plan.slug
                      ? "Redirecting…"
                      : plan.stripePriceId
                        ? PLAN_CTA_LABELS[plan.slug]
                        : "Temporarily unavailable"}
                  </Button>
                )}
                {!isFree ? (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {interval === "annual" ? "Annual" : "Monthly"} Stripe checkout · cancel anytime
                  </p>
                ) : (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Explore the product before upgrading.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </section>
  );
}
