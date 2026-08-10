import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useFinishOnce } from '@/lib/gameLifecycle';

export default function GameResultScreen({
  icon,
  title,
  subtitle,
  children,
  onContinue,
  result = {},
  continueLabel = 'Continue',
}) {
  const finish = useFinishOnce(onContinue);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto text-center bg-card rounded-3xl border border-border p-10"
    >
      {icon ? <div className="mb-5">{icon}</div> : null}
      <h2 className="font-heading text-3xl font-bold mb-2">{title}</h2>
      {subtitle ? <p className="text-muted-foreground mb-6">{subtitle}</p> : null}
      {children}
      <Button
        type="button"
        className="mt-6 gap-2"
        disabled={finish.isSubmitting}
        onClick={() => finish.trigger(result)}
      >
        {finish.isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          continueLabel
        )}
      </Button>
    </motion.div>
  );
}
