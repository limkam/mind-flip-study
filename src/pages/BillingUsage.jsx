// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ArrowUpRight, BookOpen, Check, CreditCard,
  FileText, Gamepad2, Layers3, LockKeyhole, RefreshCw,
  Sparkles, Users, WalletCards, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import BuyCreditsModal from "@/components/billing/BuyCreditsModal";
import { cancelSubscriptionAtPeriodEnd, fetchBillingInvoices, fetchBillingOverview, fetchBillingPaymentMethod, fetchCreditPurchaseHistory, openCustomerPortal, openUpdatePaymentMethod, retryPastDuePayment, syncSubscriptionFromStripe } from "@/lib/billing";
import { planLabelFromSlug } from "@/lib/plans";
import { annualSavings, formatBillingDate, formatMoney, remainingAllowance, usageLevel, usagePercentage } from "@/lib/billingView";
import { getApiErrorMessage } from "@/lib/apiError";
import { trackClientEvent } from "@/lib/analytics";

const USAGE_META = {
  books: { label: "Books processed", icon: BookOpen },
  flashcard_sets: { label: "Flashcard sets generated", icon: Layers3 },
};
const REASON_LABELS = {
  monthly_allowance: "Monthly content allowance granted",
  monthly_regen_allowance: "Monthly regeneration allowance granted",
  purchased_credits: "Purchased credits added",
  create_book: "Book processed",
  create_set: "Flashcard set generated",
  regen: "Content regenerated",
  activate_shared_content: "Shared study group material added",
};
const ACTIVITY_FILTERS = [
  { value: "all", label: "All activity" },
  { value: "added", label: "Credits added" },
  { value: "used", label: "Credits used" },
  { value: "purchases", label: "Purchases" },
];
const levelStyles = {
  normal: "bg-emerald-500", warning: "bg-amber-500", critical: "bg-orange-500", exhausted: "bg-destructive",
};

function retryTransientFailure(failureCount, error) {
  const status = error?.response?.status;
  return failureCount < 1 && (!status || status >= 500);
}

function statusLabel(subscription) {
  if (subscription.cancel_at_period_end) return "Canceling";
  return ({ active: "Active", trialing: "Active", past_due: "Past due", canceled: "Canceled", free: "Free" })[subscription.status] || "Unknown";
}

function BillingSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-72 rounded-3xl" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div></div>;
}

function UsageCard({ item }) {
  const meta = USAGE_META[item.key];
  const Icon = meta.icon;
  const remaining = remainingAllowance(item.used, item.limit);
  const percentage = usagePercentage(item.used, item.limit);
  const level = usageLevel(item.used, item.limit);
  const shared = item.breakdown?.shared || 0;
  return (
    <article className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span>
          <div>
            <h3 className="font-semibold">{meta.label}</h3>
            <p className="text-sm text-muted-foreground">{item.used} of {item.limit} used</p>
            {shared > 0 && (
              <p className="text-xs text-muted-foreground">
                {item.breakdown.own} uploaded · {shared} from Study Groups
              </p>
            )}
          </div>
        </div>
        <Badge variant={level === "normal" ? "secondary" : "outline"}>{remaining} remaining</Badge>
      </div>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${meta.label}: ${item.used} of ${item.limit} used, ${remaining} remaining`} aria-valuemin={0} aria-valuemax={item.limit} aria-valuenow={Math.min(item.used, item.limit)}>
        <div className={`h-full rounded-full transition-[width] ${levelStyles[level]}`} style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{percentage}% used · {level === "exhausted" ? "Allowance exhausted" : "Available"}</span><span>Resets {formatBillingDate(item.resets_at)}</span></div>
    </article>
  );
}

export default function BillingUsage() {
  const [buying, setBuying] = useState(false);
  const [filter, setFilter] = useState("all");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [updatingPaymentMethod, setUpdatingPaymentMethod] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const overview = useQuery({
    queryKey: ["billing-overview"],
    queryFn: fetchBillingOverview,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: retryTransientFailure,
  });
  const invoices = useQuery({
    queryKey: ["billing-invoices"],
    queryFn: fetchBillingInvoices,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: retryTransientFailure,
  });
  const paymentMethod = useQuery({
    queryKey: ["billing-payment-method"],
    queryFn: fetchBillingPaymentMethod,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: retryTransientFailure,
  });
  const purchaseHistory = useQuery({
    queryKey: ["credit-purchase-history"],
    queryFn: fetchCreditPurchaseHistory,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: retryTransientFailure,
  });

  useEffect(() => { trackClientEvent("billing_page_viewed"); }, []);

  useEffect(() => {
    if (searchParams.get("payment_method_updated") !== "1") return;
    setSearchParams((next) => { next.delete("payment_method_updated"); return next; }, { replace: true });
    retryPastDuePayment()
      .then((result) => {
        if (result?.resolved) {
          toast({ title: "Payment successful", description: "Your subscription is active again." });
        } else if (result?.had_past_due_invoice) {
          toast({
            title: "Payment method updated",
            description: "We'll retry the failed payment shortly. If it fails again you'll get another email.",
          });
        } else {
          toast({ title: "Payment method updated" });
        }
        queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
        queryClient.invalidateQueries({ queryKey: ["billing-payment-method"] });
        queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
        queryClient.invalidateQueries({ queryKey: ["billing-payment-method"] });
      });
    // Only ever fires once per return trip from the portal.
  }, [searchParams]);

  const updatePaymentMethod = async () => {
    setUpdatingPaymentMethod(true);
    setPortalError("");
    trackClientEvent("payment_method_update_opened");
    try {
      await openUpdatePaymentMethod();
    } catch (err) {
      setPortalError(getApiErrorMessage(err, "Could not open the payment method update page. Please try again."));
    } finally {
      setUpdatingPaymentMethod(false);
    }
  };

  useQuery({
    queryKey: ["billing-subscription-sync"], queryFn: async () => {
      const result = await syncSubscriptionFromStripe();
      if (result?.synced) await queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
      return result;
    }, enabled: overview.data?.subscription?.needs_reconciliation === true, retry: false, staleTime: 60_000,
  });

  const data = overview.data;
  const activity = useMemo(() => (data?.activity || []).filter((entry) => {
    if (filter === "all") return true;
    if (filter === "used") return entry.amount < 0;
    if (filter === "added") return entry.amount > 0;
    return filter === "purchases" && entry.reason === "purchased_credits";
  }), [data?.activity, filter]);

  const handleCancelSubscription = async () => {
    setCanceling(true);
    setPortalError("");
    try {
      await cancelSubscriptionAtPeriodEnd();
      toast({
        title: "Subscription canceled",
        description: "Your subscription will not renew after the current period ends.",
      });
      await queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["billing-entitlements"] });
    } catch (err) {
      setPortalError(getApiErrorMessage(err, "Failed to cancel subscription. Please try again."));
    } finally {
      setCanceling(false);
    }
  };

  const manage = async () => {
    setPortalLoading(true);
    setPortalError("");
    trackClientEvent("customer_portal_opened");
    try {
      await openCustomerPortal();
    } catch (err) {
      setPortalError(getApiErrorMessage(err, "Subscription management is temporarily unavailable. Please try again later."));
    } finally {
      setPortalLoading(false);
    }
  };

  if (overview.isLoading) return <div className="mx-auto max-w-7xl space-y-8 pb-14"><header><h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; Usage</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage your subscription, monitor monthly allowances, review credits, and access billing history.</p></header><BillingSkeleton /></div>;
  if (overview.isError || !data) return <div className="mx-auto max-w-7xl space-y-8 pb-14"><header><h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; Usage</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage your subscription, monitor monthly allowances, review credits, and access billing history.</p></header><div className="mx-auto max-w-xl rounded-3xl border border-destructive/20 bg-card p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h2 className="mt-4 text-2xl font-bold">Billing data is unavailable</h2><p className="mt-2 text-muted-foreground">We could not load your subscription or usage. No missing values have been shown as zero.</p><Button className="mt-6" onClick={() => overview.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></div>;

  const sub = data.subscription;
  const conflict = sub.state === "subscription_conflict";
  const paid = !conflict && sub.plan_slug !== "free";
  const planName = conflict ? "Subscription review required" : planLabelFromSlug(sub.plan_slug);
  const nearLimit = data.usage.find((item) => usagePercentage(item.used, item.limit) >= 90);
  const creditPosition = data.credits;
  const hasAuthoritativeCreditPosition = Boolean(
    creditPosition
    && Number.isInteger(creditPosition.available_total)
    && creditPosition.plan
    && Number.isInteger(creditPosition.plan.allocated)
    && Number.isInteger(creditPosition.plan.used)
    && Number.isInteger(creditPosition.plan.remaining)
    && creditPosition.purchased
    && typeof creditPosition.purchased === "object"
    && Number.isInteger(creditPosition.purchased.purchased_total)
    && Number.isInteger(creditPosition.purchased.used)
    && Number.isInteger(creditPosition.purchased.remaining)
  );
  const purchasedPosition = hasAuthoritativeCreditPosition ? creditPosition.purchased : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-14">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; Usage</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage your subscription, monitor monthly allowances, review credits, and access billing history.</p></div>
        <div className="flex flex-wrap gap-3">{paid || conflict ? <Button onClick={manage} disabled={portalLoading}>{portalLoading ? "Opening…" : "Manage subscription"}<ArrowUpRight className="ml-2 h-4 w-4" /></Button> : <Button asChild><Link to="/pricing">Upgrade plan</Link></Button>}{!conflict ? <Button variant="outline" asChild><Link to="/pricing">Compare plans</Link></Button> : null}</div>
      </header>

      {!conflict && sub.status === "past_due" ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-5" role="alert">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <h2 className="font-semibold">Your last payment failed</h2>
                <p className="mt-1 text-sm text-muted-foreground">Update your payment method to keep your subscription active. Stripe will keep retrying automatically, but updating now resolves it immediately.</p>
              </div>
            </div>
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0" onClick={updatePaymentMethod} disabled={updatingPaymentMethod}>
              {updatingPaymentMethod ? "Opening…" : "Update payment method"}
            </Button>
          </div>
        </div>
      ) : null}

      {conflict ? <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-5" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><h2 className="font-semibold">Multiple active subscriptions need review</h2><p className="mt-1 text-sm text-muted-foreground">We found {sub.conflict_count} active subscription records. Renewal dates and pricing are hidden to avoid showing misleading information. Open Stripe billing management or contact support before starting another checkout.</p></div></div></div> : null}
      {portalError ? <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm" role="alert">{portalError}</div> : null}

      {nearLimit ? <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">{USAGE_META[nearLimit.key].label} allowance nearly used</p><p className="text-muted-foreground">You have {remainingAllowance(nearLimit.used, nearLimit.limit)} remaining until {formatBillingDate(nearLimit.resets_at)}.</p></div></div> : null}

      {!conflict ? <section className="overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-sm">
        <div className="grid lg:grid-cols-[1.25fr_1fr]">
          <div className="bg-gradient-to-br from-primary/[0.10] via-card to-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">{planName}</Badge>
              <Badge variant="outline">{sub.billing_interval === "annual" ? "Annual billing" : sub.billing_interval === "monthly" ? "Monthly billing" : "No paid billing"}</Badge>
              <Badge variant="secondary"><span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />{statusLabel(sub)}</Badge>
            </div>
            <div className="mt-7 flex items-end gap-2">
              <span className="text-4xl font-bold">{formatMoney(sub.amount_cents, sub.currency)}</span>
              {paid ? <span className="pb-1 text-muted-foreground">{sub.billing_interval === "annual" ? "/ year" : "/ month"}</span> : null}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              {sub.cancel_at_period_end ? `Your plan remains active until ${formatBillingDate(sub.current_period_end)}.` : paid ? `Your plan renews on ${formatBillingDate(sub.current_period_end)}.` : "Upgrade whenever you need higher monthly allowances."}
            </p>
            {paid && !sub.cancel_at_period_end ? (
              <div className="mt-6">
                <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleCancelSubscription} disabled={canceling}>
                  {canceling ? "Canceling…" : "Cancel subscription"}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="grid content-center gap-4 border-t border-border/70 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription &amp; Usage Period</p><p className="mt-1 font-medium">{formatBillingDate(sub.usage_period_start || sub.current_period_start)} – {formatBillingDate(sub.usage_resets_at || sub.current_period_end)}</p><p className="mt-1 text-xs text-muted-foreground">Included plan allowances reset when your subscription renews. Purchased extra credits never expire.</p></div>
          </div>
        </div>
      </section> : null}

      <section aria-labelledby="usage-heading"><div className="mb-4"><h2 id="usage-heading" className="font-heading text-2xl font-bold">Monthly usage</h2><p className="text-sm text-muted-foreground">Separate feature allowances for the current calendar month.</p></div><div className="grid gap-4 md:grid-cols-2">{data.usage.map((item) => <UsageCard key={item.key} item={item} />)}</div></section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Your plan includes</h2><div className="mt-5 grid gap-x-8 sm:grid-cols-2">{[
          [BookOpen, "Books", `${data.usage.find(x => x.key === "books")?.limit} per month`], [Layers3, "Flashcard sets", `${data.usage.find(x => x.key === "flashcard_sets")?.limit} per month`], [FileText, "Cards per set", `Up to ${data.limits.cards_per_set}`], [Gamepad2, "Game modes", `${data.limits.games} modes · summary + ${data.limits.game_scenarios} scenarios`], [Sparkles, "Challenges", data.limits.challenges ? "Included" : "Not included in your plan"], [Users, "Study groups", data.limits.study_groups === "create_and_run" ? "Create and run" : "Join only"], [Zap, "Regeneration", ({ included: "Included", extra_credits: "Requires extra credits", not_included: "Not included" })[data.limits.regeneration]], [Check, "Daily Review", data.limits.daily_review === "unlimited" ? "Unlimited" : `${data.limits.daily_review} cards daily`],
        ].map(([Icon, label, value]) => <div key={label} className="flex gap-3 border-b border-border/60 py-4"><Icon className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground">{value}</p></div></div>)}</div></div>
        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <div className="flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">Credit balance</h2><p className="text-sm text-muted-foreground">Plan and purchased credits are tracked separately</p></div><WalletCards className="h-6 w-6 text-primary" /></div>
          {hasAuthoritativeCreditPosition ? <>
            <div className="mt-5 rounded-2xl bg-primary/10 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total available</p><p className="mt-1 text-3xl font-bold">{creditPosition.available_total} credits</p></div>
            <div className="mt-3 rounded-2xl border p-4"><h3 className="font-semibold">Plan credits</h3><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><span className="text-muted-foreground">Included</span><strong className="block text-xl">{creditPosition.plan.allocated}</strong></div><div><span className="text-muted-foreground">Used</span><strong className="block text-xl">{creditPosition.plan.used}</strong></div><div><span className="text-muted-foreground">Remaining</span><strong className="block text-xl">{creditPosition.plan.remaining}</strong></div></div><p className="mt-3 text-xs text-muted-foreground">Renewable plan credits are used first and reset at the plan-cycle boundary.</p></div>
            <div className="mt-3 rounded-2xl border border-primary/20 p-4"><h3 className="font-semibold">Purchased credits</h3>{purchasedPosition.purchased_total === 0 ? <p className="mt-2 text-sm text-muted-foreground">You haven&apos;t purchased any extra credits yet.</p> : null}<div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><span className="text-muted-foreground">Purchased</span><strong className="block text-xl">{purchasedPosition.purchased_total}</strong></div><div><span className="text-muted-foreground">Used</span><strong className="block text-xl">{purchasedPosition.used}</strong></div><div><span className="text-muted-foreground">Remaining</span><strong className="block text-xl">{purchasedPosition.remaining}</strong></div></div><p className="mt-3 text-xs text-muted-foreground">Extra credits do not expire and survive renewal, downgrade, or cancellation.</p></div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Plan credits are consumed first. Purchased credits are used only after eligible plan credits run out.</p>
          </> : <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4" role="status"><p className="font-semibold">Credit accounting details are temporarily unavailable</p><p className="mt-1 text-sm text-muted-foreground">The server returned an older billing response. No missing values have been estimated.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => overview.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>}
          <Button variant="outline" className="mt-5 w-full" onClick={() => { setBuying(true); trackClientEvent("credit_purchase_initiated"); }}>Buy credits</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-border/70 bg-card p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Usage &amp; credit activity</h2><p className="text-sm text-muted-foreground">See credits added to and used from your balance.</p></div><div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{ACTIVITY_FILTERS.map(({ value, label }) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}</div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b text-muted-foreground"><tr><th className="py-3">Date</th><th>Activity</th><th>Source</th><th>Expires</th><th className="text-right">Change</th></tr></thead><tbody>{activity.map((entry) => <tr key={entry.id} className="border-b border-border/60"><td className="py-4 pr-4">{formatBillingDate(entry.created_at)}</td><td className="font-medium">{REASON_LABELS[entry.reason] || entry.reason.replaceAll("_", " ")}</td><td className="capitalize text-muted-foreground">{entry.pool}</td><td className="text-muted-foreground">{entry.expires_at ? formatBillingDate(entry.expires_at) : "Does not expire"}</td><td className={`text-right font-semibold ${entry.amount >= 0 ? "text-emerald-600" : "text-amber-600"}`}>{entry.amount > 0 ? "+" : ""}{entry.amount} credits</td></tr>)}</tbody></table>{!activity.length ? <div className="py-12 text-center"><RefreshCw className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 font-medium">No matching activity</p><p className="text-sm text-muted-foreground">Credit additions and usage will appear here.</p></div> : null}</div></section>

      <section className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Credit purchase history</h2><p className="text-sm text-muted-foreground">Authoritative one-time Stripe purchases, separate from subscription invoices.</p><div className="mt-5 space-y-3">{purchaseHistory.isLoading ? <Skeleton className="h-24 rounded-2xl" /> : purchaseHistory.isError ? <div className="rounded-2xl border border-destructive/20 p-5"><p>Purchase history is unavailable.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => purchaseHistory.refetch()}>Retry</Button></div> : purchaseHistory.data.purchases.map((purchase) => <div key={purchase.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{purchase.quantity} {purchase.quantity === 1 ? "credit" : "credits"}</p><p className="text-sm text-muted-foreground">{formatBillingDate(purchase.created_at)} · {formatMoney(purchase.amount_paid_cents, purchase.currency)}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{purchase.status}</Badge>{purchase.receipt_url ? <Button variant="outline" size="sm" asChild><a href={purchase.receipt_url} target="_blank" rel="noreferrer">View receipt</a></Button> : null}</div></div>)}{purchaseHistory.isSuccess && !purchaseHistory.data.purchases.length ? <div className="rounded-2xl bg-muted/40 py-10 text-center"><CreditCard className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-2 font-medium">No credit purchases yet</p></div> : null}</div></section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><div className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Payment &amp; invoice history</h2><div className="mt-5 space-y-3">{invoices.isLoading ? <Skeleton className="h-28 rounded-2xl" /> : invoices.isError ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center"><p className="font-medium">Invoice history is unavailable</p><p className="mt-1 text-sm text-muted-foreground">Your subscription and credits are unaffected.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => invoices.refetch()}>Retry</Button></div> : invoices.data.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{planName} subscription</p><p className="text-sm text-muted-foreground">{formatBillingDate(invoice.created_at)} · {formatMoney(invoice.amount_cents, invoice.currency)}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{invoice.status}</Badge>{invoice.hosted_invoice_url || invoice.invoice_pdf ? <Button variant="outline" size="sm" asChild><a href={invoice.hosted_invoice_url || invoice.invoice_pdf} target="_blank" rel="noreferrer">View invoice</a></Button> : null}</div></div>)}{invoices.isSuccess && !invoices.data.length ? <div className="rounded-2xl bg-muted/40 py-10 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-2 font-medium">No invoices available</p><p className="text-sm text-muted-foreground">Verified Stripe invoices will appear here.</p></div> : null}</div></div><div className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Payment method</h2>{paymentMethod.isLoading ? <Skeleton className="mt-5 h-24 rounded-2xl" /> : paymentMethod.isError ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center"><p className="font-medium">Payment method is unavailable</p><Button variant="outline" size="sm" className="mt-3" onClick={() => paymentMethod.refetch()}>Retry</Button></div> : paymentMethod.data ? <div className="mt-5 flex items-center gap-4 rounded-2xl bg-muted/50 p-4"><span className="rounded-xl bg-background p-3"><CreditCard className="h-6 w-6" /></span><div><p className="font-semibold capitalize">{paymentMethod.data.brand} •••• {paymentMethod.data.last4}</p><p className="text-sm text-muted-foreground">Expires {paymentMethod.data.exp_month}/{paymentMethod.data.exp_year}</p></div></div> : <div className="mt-5 rounded-2xl bg-muted/40 p-5 text-center"><LockKeyhole className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 font-medium">Managed securely by Stripe</p><p className="text-sm text-muted-foreground">Payment details are not stored by Bilkeys.</p></div>} {paid ? <Button variant="outline" className="mt-5 w-full" onClick={updatePaymentMethod} disabled={updatingPaymentMethod}>{updatingPaymentMethod ? "Opening…" : "Update payment method"}</Button> : null}</div></section>

      <section className="flex flex-col gap-4 rounded-3xl border border-primary/15 bg-primary/[0.045] p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Need different limits?</h2><p className="mt-1 text-sm text-muted-foreground">Compare monthly and annual plans. Standard 15 is the most popular option.</p>{data.subscription.plan_slug === "quick_72" ? <p className="mt-2 text-xs text-muted-foreground">Annual Quick 7 saves {formatMoney(annualSavings(499, 3900))} compared with 12 monthly payments.</p> : null}</div><Button asChild><Link to="/pricing">Compare all plans <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></section>
      <BuyCreditsModal open={buying} onClose={() => setBuying(false)} />
    </div>
  );
}
