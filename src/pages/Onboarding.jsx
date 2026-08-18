import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";

import client from "@/api/client";
import { MindFlipBrand } from "@/components/brand/MindFlipLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";
import { COUNTRIES } from "@/lib/countries";

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.full_name || "");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [customCountry, setCustomCountry] = useState("");
  const [occupation, setOccupation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    void client.post('/activity/onboarding/start').catch(() => {});
  }, []);

  const finish = async (event) => {
    event.preventDefault();
    setFormError("");
    const dob = new Date(`${dateOfBirth}T00:00:00`);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age -= 1;
    if (!dateOfBirth || Number.isNaN(dob.getTime()) || age < 13) {
      setFormError("MindFlip is only available to users aged 13 and above.");
      return;
    }
    setSubmitting(true);
    try {
      await client.post("/auth/onboarding", {
        full_name: name.trim() || null,
        date_of_birth: dateOfBirth,
        gender: gender || null,
        country,
        custom_country: country === "Other" ? customCountry.trim() : null,
        occupation: occupation.trim(),
        job_title: jobTitle.trim() || null,
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
      <section className="w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <MindFlipBrand centered className="mb-8" surface="on-light" />
          <h1 className="font-heading text-3xl font-bold">Tell us about yourself</h1>
          <p className="mt-2 text-sm text-muted-foreground">This helps us personalize your MindFlip experience.</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={finish}>
          <div className="space-y-2">
            <Label htmlFor="display-name">What should we call you?</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoComplete="name"
              placeholder="Your name"
              className="h-11"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date-of-birth">Date of birth</Label>
            <Input id="date-of-birth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} max={new Date().toISOString().slice(0, 10)} required className="h-11" />
            <p className="text-xs text-muted-foreground">You must be at least 13 years old.</p>
          </div>
          <div className="space-y-2">
            <Label>Gender <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry} required>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select your country" /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {country === "Other" ? (
            <div className="space-y-2">
              <Label htmlFor="custom-country">Country name</Label>
              <Input id="custom-country" value={customCountry} onChange={(event) => setCustomCountry(event.target.value)} maxLength={128} required />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation</Label>
            <Input
              id="occupation"
              value={occupation}
              onChange={(event) => setOccupation(event.target.value)}
              maxLength={100}
              placeholder="e.g. Software Engineer"
              required
            />
            <p className="text-xs text-muted-foreground">Your broad profession or type of work.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-title">Job title <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="job-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={100} placeholder="e.g. Senior Backend Engineer" />
            <p className="text-xs text-muted-foreground">Your specific position within an organization.</p>
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={submitting || !dateOfBirth || !country || !occupation.trim() || (country === "Other" && !customCountry.trim())}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            {!submitting ? <ArrowRight className="ml-auto h-4 w-4" /> : null}
          </Button>
        </form>
      </section>
    </main>
  );
}
