// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { cancelSubscriptionAtPeriodEnd, fetchBillingOverview, openCustomerPortal, syncSubscriptionFromStripe } from "@/lib/billing";
import { planLabelFromSlug } from "@/lib/plans";
import { annualSavings, daysUntil, formatBillingDate, formatMoney, remainingAllowance, usageLevel, usagePercentage } from "@/lib/billingView";
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
};
const ACTIVITY_FILTERS = ["all", "usage", "allowances", "purchases"];
const levelStyles = {
  normal: "bg-emerald-500", warning: "bg-amber-500", critical: "bg-orange-500", exhausted: "bg-destructive",
};

function statusLabel(subscription) {
  if (subscription.cancel_at_period_end) return "Canceling";
  return ({ active: "Active", trialing: "Trialing", past_due: "Past due", canceled: "Canceled", free: "Free" })[subscription.status] || "Unknown";
}

function BillingSkeleton() {
  return <div className="mx-auto max-w-7xl space-y-6 pb-12"><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-72 rounded-3xl" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div></div>;
}

function UsageCard({ item }) {
  const meta = USAGE_META[item.key];
  const Icon = meta.icon;
  const remaining = remainingAllowance(item.used, item.limit);
  const percentage = usagePercentage(item.used, item.limit);
  const level = usageLevel(item.used, item.limit);
  return (
    <article className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span><div><h3 className="font-semibold">{meta.label}</h3><p className="text-sm text-muted-foreground">{item.used} of {item.limit} used</p></div></div>
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ["billing-overview"],
    queryFn: fetchBillingOverview,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => { trackClientEvent("billing_page_viewed"); }, []);

  useQuery({
    queryKey: ["billing-subscription-sync"], queryFn: async () => {
      const result = await syncSubscriptionFromStripe();
      if (result?.synced) await queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
      return result;
    }, enabled: overview.data?.subscription?.plan_slug === "free", retry: false, staleTime: 60_000,
  });

  const data = overview.data;
  const activity = useMemo(() => (data?.activity || []).filter((entry) => {
    if (filter === "all") return true;
    if (filter === "usage") return entry.amount < 0;
    if (filter === "allowances") return entry.reason.includes("allowance");
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

  if (overview.isLoading) return <BillingSkeleton />;
  if (overview.isError || !data) return <div className="mx-auto max-w-xl rounded-3xl border border-destructive/20 bg-card p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-4 text-2xl font-bold">Billing data is unavailable</h1><p className="mt-2 text-muted-foreground">We could not load your subscription or usage. No missing values have been shown as zero.</p><Button className="mt-6" onClick={() => overview.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>;

  const sub = data.subscription;
  const conflict = sub.state === "subscription_conflict";
  const paid = !conflict && sub.plan_slug !== "free";
  const planName = conflict ? "Subscription review required" : planLabelFromSlug(sub.plan_slug);
  const renewalDays = daysUntil(sub.current_period_end);
  const nearLimit = data.usage.find((item) => usagePercentage(item.used, item.limit) >= 90);
  const optionalCredits = data.credits.purchased + data.credits.monthly_regeneration + data.credits.purchased_regeneration;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-14">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; Usage</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage your subscription, monitor monthly allowances, review credits, and access billing history.</p></div>
        <div className="flex flex-wrap gap-3">{paid || conflict ? <Button onClick={manage} disabled={portalLoading}>{portalLoading ? "Opening…" : "Manage subscription"}<ArrowUpRight className="ml-2 h-4 w-4" /></Button> : <Button asChild><Link to="/pricing">Upgrade plan</Link></Button>}{!conflict ? <Button variant="outline" asChild><Link to="/pricing">Compare plans</Link></Button> : null}</div>
      </header>

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
              <span className="pb-1 text-muted-foreground">{paid ? (sub.billing_interval === "annual" ? "/ year" : "/ month") : "forever"}</span>
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
        <div className="rounded-3xl border border-border/70 bg-card p-6"><div className="flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">Credits wallet</h2><p className="text-sm text-muted-foreground">Shared and optional balances</p></div><WalletCards className="h-6 w-6 text-primary" /></div><div className="mt-5 rounded-2xl bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Monthly content credits</p><p className="mt-1 text-3xl font-bold">{data.credits.monthly_content}</p><p className="mt-1 text-xs text-muted-foreground">Used for books and flashcard generation; expires at the monthly reset.</p></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Creating content requires both an available feature allowance above and enough credits. Monthly credits are consumed first, followed by purchased credits.</p>{optionalCredits > 0 ? <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3"><span className="text-muted-foreground">Purchased</span><strong className="mt-1 block text-xl">{data.credits.purchased}</strong></div><div className="rounded-xl border p-3"><span className="text-muted-foreground">Regeneration</span><strong className="mt-1 block text-xl">{data.credits.monthly_regeneration + data.credits.purchased_regeneration}</strong></div></div> : <p className="mt-4 text-sm text-muted-foreground">No additional credits purchased. Your monthly plan allowances remain available above.</p>}<Button variant="outline" className="mt-5 w-full" onClick={() => { setBuying(true); trackClientEvent("credit_purchase_initiated"); }}>Buy credits</Button></div>
      </section>

      <section className="rounded-3xl border border-border/70 bg-card p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Usage &amp; credit activity</h2><p className="text-sm text-muted-foreground">Every allowance grant and credit movement.</p></div><div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{ACTIVITY_FILTERS.map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${filter === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}</div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b text-muted-foreground"><tr><th className="py-3">Date</th><th>Activity</th><th>Source</th><th>Expires</th><th className="text-right">Change</th></tr></thead><tbody>{activity.map((entry) => <tr key={entry.id} className="border-b border-border/60"><td className="py-4 pr-4">{formatBillingDate(entry.created_at)}</td><td className="font-medium">{REASON_LABELS[entry.reason] || entry.reason.replaceAll("_", " ")}</td><td className="capitalize text-muted-foreground">{entry.pool}</td><td className="text-muted-foreground">{entry.expires_at ? formatBillingDate(entry.expires_at) : "Does not expire"}</td><td className={`text-right font-semibold ${entry.amount >= 0 ? "text-emerald-600" : "text-amber-600"}`}>{entry.amount > 0 ? "+" : ""}{entry.amount} credits</td></tr>)}</tbody></table>{!activity.length ? <div className="py-12 text-center"><RefreshCw className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 font-medium">No matching activity</p><p className="text-sm text-muted-foreground">Allowance grants and usage will appear here.</p></div> : null}</div></section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><div className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Payment &amp; invoice history</h2><div className="mt-5 space-y-3">{data.invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{planName} subscription</p><p className="text-sm text-muted-foreground">{formatBillingDate(invoice.created_at)} · {formatMoney(invoice.amount_cents, invoice.currency)}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{invoice.status}</Badge>{invoice.hosted_invoice_url || invoice.invoice_pdf ? <Button variant="outline" size="sm" asChild><a href={invoice.hosted_invoice_url || invoice.invoice_pdf} target="_blank" rel="noreferrer">View invoice</a></Button> : null}</div></div>)}{!data.invoices.length ? <div className="rounded-2xl bg-muted/40 py-10 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-2 font-medium">No invoices available</p><p className="text-sm text-muted-foreground">Verified Stripe invoices will appear here.</p></div> : null}</div></div><div className="rounded-3xl border border-border/70 bg-card p-6"><h2 className="font-heading text-xl font-bold">Payment method</h2>{data.payment_method ? <div className="mt-5 flex items-center gap-4 rounded-2xl bg-muted/50 p-4"><span className="rounded-xl bg-background p-3"><CreditCard className="h-6 w-6" /></span><div><p className="font-semibold capitalize">{data.payment_method.brand} •••• {data.payment_method.last4}</p><p className="text-sm text-muted-foreground">Expires {data.payment_method.exp_month}/{data.payment_method.exp_year}</p></div></div> : <div className="mt-5 rounded-2xl bg-muted/40 p-5 text-center"><LockKeyhole className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 font-medium">Managed securely by Stripe</p><p className="text-sm text-muted-foreground">Payment details are not stored by MindFlip.</p></div>} {paid ? <Button variant="outline" className="mt-5 w-full" onClick={manage}>Update in Stripe</Button> : null}</div></section>

      <section className="flex flex-col gap-4 rounded-3xl border border-primary/15 bg-primary/[0.045] p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Need different limits?</h2><p className="mt-1 text-sm text-muted-foreground">Compare monthly and annual plans. Standard 15 is the most popular option.</p>{data.subscription.plan_slug === "quick_72" ? <p className="mt-2 text-xs text-muted-foreground">Annual Quick 7 saves {formatMoney(annualSavings(399, 2400))} compared with 12 monthly payments.</p> : null}</div><Button asChild><Link to="/pricing">Compare all plans <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></section>
      <BuyCreditsModal open={buying} onClose={() => setBuying(false)} />
    </div>
  );
}
