import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/apiError';
import { isFreeTier, startCheckout, subscriptionLabel } from '@/lib/billing';

const BASIC_FEATURES = [
  'Unlimited PDF uploads',
  'Unlimited flashcard sets',
  'Unlimited cards',
  'All 8 games',
  'Priority AI generation',
];

const PREMIUM_FEATURES = [
  'Everything in Student',
  'Offline study mode',
  'Priority support',
  'All premium study features',
];

function PlanCard({ badge, title, price, subtitle, features, highlighted, loading, onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col rounded-2xl border-2 p-5 ${
        highlighted
          ? 'border-primary bg-gradient-to-b from-primary/5 to-card shadow-md'
          : 'border-border bg-card'
      }`}
    >
      {badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold">{price}</p>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <ul className="mb-5 flex-1 space-y-2">
        {features.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onSelect} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Redirecting…' : 'Upgrade'}
      </Button>
    </motion.div>
  );
}

export default function UpgradeSection({ subscriptionTier, compact = false }) {
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleCheckout = async (plan) => {
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
    } catch (err) {
      setLoadingPlan(null);
      toast({
        title: 'Checkout unavailable',
        description: getApiErrorMessage(err, 'Could not start checkout. Try again later.'),
        variant: 'destructive',
      });
    }
  };

  if (!isFreeTier(subscriptionTier)) {
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
            <p className="font-heading text-lg font-semibold">
              {subscriptionLabel(subscriptionTier)} plan active
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You have full access to uploads, flashcards, and premium study features.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          className="flex-1 gap-2"
          disabled={!!loadingPlan}
          onClick={() => handleCheckout('basic')}
        >
          {loadingPlan === 'basic' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Student — $3.99/mo
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          disabled={!!loadingPlan}
          onClick={() => handleCheckout('premium')}
        >
          {loadingPlan === 'premium' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Premium — $7.99/mo
        </Button>
      </div>
    );
  }

  return (
    <motion.div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Upgrade your plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlock unlimited uploads, sets, and cards. Cancel anytime from your Stripe receipt.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard
          title="Student"
          price={
            <>
              $3.99<span className="text-base font-normal text-muted-foreground">/month</span>
            </>
          }
          subtitle="Flexible monthly billing"
          features={BASIC_FEATURES}
          loading={loadingPlan === 'basic'}
          onSelect={() => handleCheckout('basic')}
        />
        <PlanCard
          badge="Most features"
          title="Premium"
          price={
            <>
              $7.99<span className="text-base font-normal text-muted-foreground">/month</span>
            </>
          }
          subtitle="Full access, billed monthly"
          features={PREMIUM_FEATURES}
          highlighted
          loading={loadingPlan === 'premium'}
          onSelect={() => handleCheckout('premium')}
        />
      </div>
    </motion.div>
  );
}
