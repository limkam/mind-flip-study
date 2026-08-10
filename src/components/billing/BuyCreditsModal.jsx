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
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["credit-pricing"],
    queryFn: fetchCreditPricing,
    enabled: open,
  });

  if (!open) return null;

  const unitPrice = Number(pricing?.unit_price_cents || 80);
  const total = ((unitPrice * quantity) / 100).toFixed(2);

  const onSubmit = async () => {
    setLoading(true);
    try {
      await startCreditCheckout(quantity);
    } catch (err) {
      setLoading(false);
      toast({
        title: "Could not start purchase",
        description: getApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
        <h3 className="font-heading text-lg font-semibold">Buy credits</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Purchase one-time credits for regeneration and creation actions.
        </p>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.max(1, Number(e.target.value || 1)))
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          />
          <p className="text-xs text-muted-foreground">
            Unit: ${(unitPrice / 100).toFixed(2)} · Total: ${total}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? "Redirecting…" : "Continue to checkout"}
          </Button>
        </div>
      </div>
    </div>
  );
}
