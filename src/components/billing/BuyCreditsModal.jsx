import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchCreditPricing, startCreditCheckout } from "@/lib/billing";
import { useQuery } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/lib/apiError";

/**
 * @param {{ open: boolean; onClose: () => void }} props
 */
export default function BuyCreditsModal({ open, onClose }) {
  const { toast } = useToast();
  const [selectedCredits, setSelectedCredits] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["credit-pricing"],
    queryFn: fetchCreditPricing,
    enabled: open,
  });

  if (!open) return null;

  const tiers = pricing?.tiers || [];
  const activeCredits = selectedCredits ?? tiers[0]?.credits ?? null;
  const activeTier = tiers.find((t) => t.credits === activeCredits) || null;

  const onSubmit = async () => {
    if (!activeTier) return;
    setLoading(true);
    try {
      await startCreditCheckout(activeTier.credits);
    } catch (err) {
      toast({
        title: "Could not start purchase",
        description: getApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
        <h3 className="font-heading text-lg font-semibold">Buy credits</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Purchase a one-time credit pack for regeneration and creation actions.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiers.map((tier) => (
            <button
              key={tier.credits}
              type="button"
              onClick={() => setSelectedCredits(tier.credits)}
              className={`rounded-lg border px-3 py-2 text-center transition-colors ${
                activeCredits === tier.credits
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              <div className="text-sm font-semibold">{tier.credits} credits</div>
              <div className="text-xs text-muted-foreground">
                ${tier.price_usd.toFixed(2)}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={loading || !activeTier}>
            {loading ? "Redirecting…" : "Continue to checkout"}
          </Button>
        </div>
      </div>
    </div>
  );
}
