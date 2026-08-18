import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeSubscriptionPlan, previewSubscriptionChange } from "@/lib/billing";
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
            <DialogDescription className="pt-2 text-sm leading-6">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking what you'd be charged…
                </span>
              ) : error ? (
                <span className="text-destructive">{error}</span>
              ) : preview?.is_upgrade ? (
                <>
                  You'll be charged <strong className="text-foreground">{formatUsd(preview.amount_due_today_cents)}</strong> today
                  (prorated for the rest of your billing period), and <strong className="text-foreground">{formatUsd(preview.new_recurring_amount_cents)}</strong> {interval === "annual" ? "per year" : "per month"} going forward. Your plan changes immediately.
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
            </DialogDescription>
          </DialogHeader>
        </div>
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
