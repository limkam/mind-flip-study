import React, { useState } from "react";
import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEntitlementsSnapshot,
  getUpgradeHook,
  getUpgradeRequiredMessage,
  startCheckout,
} from "@/lib/billing";
import BuyCreditsModal from "@/components/billing/BuyCreditsModal";

export default function RegenerateScenarios({ setId, onScenariosChange }) {
  const [loading, setLoading] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [decisionHook, setDecisionHook] = useState(null);
  const { toast } = useToast();

  const { data: entitlements, refetch: refetchEntitlements } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
  });

  const handleRegenerate = async () => {
    if (!setId) return;

    const plan = entitlements?.plan_slug;
    const regenDecision = entitlements?.actions?.regeneration;

    // Standard 15: no monthly regen allowance — immediately show upgrade/purchase modal.
    if (plan === "standard_15" && !regenDecision?.allowed) {
      setDecisionHook({ free_on_premium_30: true });
      setDecisionMessage("Regeneration requires credits or upgrade.");
      setShowDecisionModal(true);
      return;
    }

    setLoading(true);
    try {
      const { data } = await client.post(
        `/flashcard-sets/${setId}/scenarios/regenerate`,
      );
      const next = data.scenarios || [];
      onScenariosChange?.(next);
      await refetchEntitlements();
      toast({
        title: "Scenarios regenerated",
        description: `${next.length} scenarios updated.`,
      });
    } catch (err) {
      if (err?.response?.status === 402) return;
      const hook = getUpgradeHook(err);
      if (hook) {
        setDecisionHook(hook);
        setDecisionMessage(
          getUpgradeRequiredMessage(err, "Regeneration is blocked."),
        );
        setShowDecisionModal(true);
        setLoading(false);
        return;
      }
      const detail = err.response?.data?.detail;
      const message =
        typeof detail === "object"
          ? detail.message
          : detail || err.message || "Regeneration failed";
      toast({
        title: "Regeneration failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-50 px-4 py-4 text-center">
        <p className="font-heading text-lg font-semibold">
          Regenerate Scenarios
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Generate a fresh set of application scenarios for this flashcard set.
        </p>
      </div>
      <div className="flex justify-center">
        <Button
          onClick={handleRegenerate}
          disabled={loading || !setId}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />{" "}
          {loading ? "Regenerating…" : "Regenerate Scenarios"}
        </Button>
      </div>

      {showDecisionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h3 className="font-heading text-lg font-semibold">
              Regeneration options
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {decisionMessage}
            </p>
            {decisionHook?.free_on_premium_30 ? (
              <p className="text-sm text-emerald-600 mt-2 font-medium">
                Free on Premium 30
              </p>
            ) : null}
            <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDecisionModal(false)}
              >
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDecisionModal(false);
                  setShowBuyCredits(true);
                }}
              >
                Buy credits
              </Button>
              <Button onClick={() => startCheckout("premium", "monthly")}>
                Upgrade to Premium 30
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <BuyCreditsModal
        open={showBuyCredits}
        onClose={() => setShowBuyCredits(false)}
      />
    </div>
  );
}
