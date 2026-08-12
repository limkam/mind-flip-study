import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchEntitlementsSnapshot, subscriptionsEnabled } from "@/lib/billing";
import { useAuth } from "@/lib/AuthContext";
import { billingAccountState } from "@/lib/billingUiState";

export default function UpgradeBanner() {
  const { isAuthenticated } = useAuth();
  const { data, isPending, isError } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated && subscriptionsEnabled(),
  });

  const accountState = billingAccountState({ data, isPending, isError });
  if (!subscriptionsEnabled() || accountState !== "free") {
    return null;
  }

  return (
    <Button asChild size="sm" variant="default" className="gap-1.5 shadow-sm">
      <Link to="/pricing">
        <Sparkles className="h-4 w-4" />
        Upgrade
      </Link>
    </Button>
  );
}
