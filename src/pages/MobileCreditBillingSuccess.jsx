import React, { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Smartphone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useApplyColorScheme } from "@/lib/colorScheme";

export default function MobileCreditBillingSuccess() {
  const { user } = useAuth();
  useApplyColorScheme(user);
  const [searchParams] = useSearchParams();
  const rawSessionId = searchParams.get("session_id") || "";
  const sessionId = rawSessionId.trim();
  const isValidFormat = sessionId.startsWith("cs_") && /^cs_[a-zA-Z0-9_]+$/.test(sessionId);

  const deepLink = isValidFormat
    ? `mindflip://billing/credits/success?session_id=${encodeURIComponent(sessionId)}`
    : "mindflip://billing/credits/success";

  useEffect(() => {
    if (isValidFormat) {
      const timer = setTimeout(() => {
        window.location.href = deepLink;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isValidFormat, deepLink]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Smartphone className="h-8 w-8 text-primary" />
      </div>
      <h1 className="font-heading text-2xl font-bold">Return to MindFlip</h1>
      <p className="mt-3 text-muted-foreground">
        Return to the MindFlip mobile app to verify your credit purchase and update your account balance.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        {isValidFormat ? (
          <Button asChild size="lg" className="w-full gap-2">
            <a href={deepLink}>
              <Smartphone className="h-4 w-4" />
              Open MindFlip App
            </a>
          </Button>
        ) : (
          <p className="text-sm font-medium text-destructive">
            Invalid checkout session link. Please open the app manually.
          </p>
        )}

        <Button asChild variant="outline" size="lg" className="w-full gap-2">
          <Link to={`/billing/credits/success${isValidFormat ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`}>
            <ExternalLink className="h-4 w-4" />
            Continue on Web
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
