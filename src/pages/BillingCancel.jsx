import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BillingCancel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-lg flex-col items-center py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <XCircle className="h-9 w-9 text-muted-foreground" />
      </div>
      <h1 className="font-heading text-3xl font-bold">Checkout cancelled</h1>
      <p className="mt-3 text-muted-foreground">
        No charge was made. You can upgrade anytime from your profile when you&apos;re ready.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="gap-2">
          <Link to="/profile">
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/">Go to dashboard</Link>
        </Button>
      </div>
    </motion.div>
  );
}
