import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import PricingPlans from "@/components/billing/PricingPlans";
import { fetchEntitlementsSnapshot } from "@/lib/billing";
import { planLabelFromSlug } from "@/lib/plans";
import { useAuth } from "@/lib/AuthContext";

export default function UpgradeSection({ compact = false }) {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated,
  });

  if (data?.plan_slug && data.plan_slug !== "free") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/20 bg-primary/5 p-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-heading text-lg font-semibold">Plan active</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {planLabelFromSlug(data.plan_slug)} · {data.subscription_status} ·{" "}
              Interval: {data.billing_interval || "—"}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">
          Upgrade your plan
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the right study volume, collaboration features, and processing
          speed.
        </p>
      </div>
      <PricingPlans compact={compact} />
    </motion.div>
  );
}
