import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Smartphone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MobileBillingCancel() {
  const deepLink = "mindflip://billing/cancel";

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = deepLink;
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Smartphone className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="font-heading text-2xl font-bold">Checkout Canceled</h1>
      <p className="mt-3 text-muted-foreground">
        You left the checkout process. No charges were made. Return to MindFlip to continue.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        <Button asChild size="lg" className="w-full gap-2">
          <a href={deepLink}>
            <Smartphone className="h-4 w-4" />
            Open MindFlip App
          </a>
        </Button>

        <Button asChild variant="outline" size="lg" className="w-full gap-2">
          <Link to="/pricing">
            <ArrowLeft className="h-4 w-4" />
            Return to Web Pricing
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
