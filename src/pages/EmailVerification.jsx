import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import client from "@/api/client";
import { MindFlipBrand } from "@/components/brand/MindFlipLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";

export default function EmailVerification() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginWithEmailCode } = useAuth();
  const email = location.state?.email;
  const dateOfBirth = location.state?.dateOfBirth || null;
  const [challengeId, setChallengeId] = useState(location.state?.challengeId || "");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(location.state?.resendAfter || 60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!email || !challengeId) return <Navigate to="/login" replace />;

  const verify = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      await loginWithEmailCode(challengeId, code, true, dateOfBirth);
      navigate("/", { replace: true });
    } catch (error) {
      toast({
        title: "Code not accepted",
        description: getApiErrorMessage(error, "The code is invalid or has expired."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await client.post("/auth/email/start", { email });
      setChallengeId(data.challenge_id);
      setCooldown(data.resend_after || 60);
      setCode("");
      toast({ title: "New code sent" });
    } catch (error) {
      toast({
        title: "Could not resend code",
        description: getApiErrorMessage(error, "Please try again shortly."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-sm">
        <button type="button" onClick={() => navigate("/login")} className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex flex-col items-center text-center">
          <MindFlipBrand centered className="mb-6" surface="on-light" />
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter the 6-digit code we sent to your email.
          </p>
          <p className="mt-1 text-sm font-medium">{email}</p>
        </div>

        <form onSubmit={verify} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-12 text-center text-xl font-semibold tracking-[0.35em]"
              placeholder="000000"
              autoFocus
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and continue"}
          </Button>
          <Button type="button" variant="ghost" className="h-10 w-full" disabled={busy || cooldown > 0} onClick={resend}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
        </form>
      </section>
    </main>
  );
}
