import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchEntitlementsSnapshot, subscriptionsEnabled } from "@/lib/billing";
import { useAuth } from "@/lib/AuthContext";

export default function UpgradeBanner() {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ["billing-entitlements"],
    queryFn: fetchEntitlementsSnapshot,
    enabled: isAuthenticated && subscriptionsEnabled(),
  });

  if (!subscriptionsEnabled() || !data || data.plan_slug !== "free") {
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
