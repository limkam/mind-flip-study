import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isFreeTier, subscriptionsEnabled } from '@/lib/billing';

export default function UpgradeBanner({ subscriptionTier }) {
  if (!subscriptionsEnabled() || !isFreeTier(subscriptionTier)) {
    return null;
  }

  return (
    <Button asChild size="sm" variant="default" className="gap-1.5 shadow-sm">
      <Link to="/profile">
        <Sparkles className="h-4 w-4" />
        Upgrade
      </Link>
    </Button>
  );
}
