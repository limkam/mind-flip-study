import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { subscriptionLabel } from '@/lib/billing';

export default function BillingSuccess() {
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const tierLabel = subscriptionLabel(user?.subscription_tier);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-lg flex-col items-center py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <h1 className="font-heading text-3xl font-bold">You&apos;re all set!</h1>
      <p className="mt-3 text-muted-foreground">
        Payment received. Your account is now on the{' '}
        <span className="font-semibold text-foreground">{tierLabel}</span> plan.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        It may take a few seconds for your subscription to appear if the webhook is still processing.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link to="/">
            <Sparkles className="h-4 w-4" />
            Start studying
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/profile">View profile</Link>
        </Button>
      </div>
    </motion.div>
  );
}
