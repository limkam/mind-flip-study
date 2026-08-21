import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeSubscriptionPlan, fetchBillingPaymentMethod, openUpdatePaymentMethod, previewSubscriptionChange } from "@/lib/billing";
import { formatUsd } from "@/lib/plans";
import { getApiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/ui/use-toast";

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

/**
 * Confirmation dialog for an existing subscriber switching plans (upgrade or downgrade).
 * Reuses the same Dialog primitives as UpgradeLimitDialog rather than inventing new UI.
 */
export default function SubscriptionChangeDialog({ open, billingPlan, interval, planLabel, onClose, onChanged }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false);
  const [updatingPaymentMethod, setUpdatingPaymentMethod] = useState(false);
  const refetchPaymentMethodOnFocus = useRef(false);

  useEffect(() => {
    if (!open || !billingPlan) return;
    let cancelled = false;
    setPreview(null);
    setError("");
    setLoading(true);
    previewSubscriptionChange(billingPlan, interval)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, "Could not preview this change."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, billingPlan, interval]);

  const loadPaymentMethod = () => {
    setPaymentMethodLoading(true);
    fetchBillingPaymentMethod()
      .then((data) => setPaymentMethod(data))
      .catch(() => setPaymentMethod(null))
      .finally(() => setPaymentMethodLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    loadPaymentMethod();
  }, [open]);

  // The card-update flow opens Stripe's hosted portal in a new tab — when the user comes
  // back to this one, pick up whatever card they ended up with instead of showing stale info.
  useEffect(() => {
    if (!open) return;
    const onFocus = () => {
      if (refetchPaymentMethodOnFocus.current) {
        refetchPaymentMethodOnFocus.current = false;
        loadPaymentMethod();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open]);

  const changePaymentMethod = async () => {
    setUpdatingPaymentMethod(true);
    try {
      await openUpdatePaymentMethod();
      refetchPaymentMethodOnFocus.current = true;
    } catch (err) {
      toast({
        title: "Could not open payment method update",
        description: getApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setUpdatingPaymentMethod(false);
    }
  };

  const close = () => {
    if (confirming) return;
    onClose();
  };

  const confirm = async () => {
    if (!billingPlan) return;
    setConfirming(true);
    try {
      const result = await changeSubscriptionPlan(billingPlan, interval);
      toast({
        title: result.is_upgrade ? "Upgraded" : "Downgrade scheduled",
        description: result.is_upgrade
          ? `You're now on ${planLabel}.`
          : `You'll switch to ${planLabel} on ${formatDate(result.pending_change_effective_at) || "your next billing date"}.`,
      });
      onChanged?.(result);
    } catch (err) {
      toast({
        title: "Could not change plan",
        description: getApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="overflow-hidden rounded-3xl border-primary/15 p-0 shadow-2xl sm:max-w-lg">
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background px-6 pb-5 pt-7">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {preview?.is_upgrade === false ? `Switch to ${planLabel}?` : `Upgrade to ${planLabel}?`}
            </DialogTitle>
            <DialogDescription asChild className="pt-2 text-sm leading-6">
            <div>
              {loading ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking what you'd be charged…
                </span>
              ) : error ? (
                <span className="text-destructive">{error}</span>
              ) : preview?.is_upgrade ? (
                <>
                  <p>Your plan changes immediately. Here's today's charge:</p>
                  <dl className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                    {preview.proration_charge_cents > 0 ? (
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">New plan (remaining time this period)</dt>
                        <dd className="font-medium text-foreground">{formatUsd(preview.proration_charge_cents)}</dd>
                      </div>
                    ) : null}
                    {preview.proration_credit_cents > 0 ? (
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Credit for unused time on your old plan</dt>
                        <dd className="font-medium text-emerald-600">-{formatUsd(preview.proration_credit_cents)}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                      <dt className="font-semibold text-foreground">Due today</dt>
                      <dd className="font-semibold text-foreground">{formatUsd(preview.amount_due_today_cents)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3">
                    Then <strong className="text-foreground">{formatUsd(preview.new_recurring_amount_cents)}</strong> {interval === "annual" ? "per year" : "per month"} going forward.
                  </p>
                </>
              ) : preview ? (
                <>
                  This takes effect at the end of your current billing period
                  {formatDate(preview.next_billing_date) ? ` on ${formatDate(preview.next_billing_date)}` : ""} —
                  <strong className="text-foreground"> you won't be charged today</strong>, and you keep your current plan and access until then.
                  {preview.downgrade_notice ? (
                    <span className="mt-3 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {preview.downgrade_notice}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
            </DialogDescription>
          </DialogHeader>
        </div>
        {!loading && !error && preview ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-muted p-2"><CreditCard className="h-4 w-4 text-muted-foreground" /></span>
              {paymentMethodLoading ? (
                <span className="text-sm text-muted-foreground">Loading payment method…</span>
              ) : paymentMethod ? (
                <span className="text-sm font-medium capitalize">{paymentMethod.brand} •••• {paymentMethod.last4}</span>
              ) : (
                <span className="text-sm text-muted-foreground">No payment method on file</span>
              )}
            </div>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={changePaymentMethod} disabled={updatingPaymentMethod}>
              {updatingPaymentMethod ? "Opening…" : "Change payment method"}
            </Button>
          </div>
        ) : null}
        <DialogFooter className="flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={close} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={loading || !!error || confirming}>
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Confirm <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
