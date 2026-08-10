import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";

import client from "@/api/client";
import { MindFlipBrand } from "@/components/brand/MindFlipLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const finish = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await client.post("/auth/onboarding", {
        full_name: name.trim() || null,
      });
      await refreshUser();
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Could not finish setting up your account."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <MindFlipBrand centered className="mb-8" surface="on-light" />
          <h1 className="font-heading text-3xl font-bold">What should we call you?</h1>
          <p className="mt-2 text-sm text-muted-foreground">You can skip this and update your name later.</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={finish}>
          <div className="space-y-2">
            <Label htmlFor="display-name">Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoComplete="name"
              placeholder={user?.full_name || "Your name"}
              className="h-11"
              autoFocus
            />
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            {!submitting ? <ArrowRight className="ml-auto h-4 w-4" /> : null}
          </Button>
        </form>
      </section>
    </main>
  );
}
