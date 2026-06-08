import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES, getContinentForCountry } from '@/lib/countries';
import { getApiErrorMessage } from '@/lib/apiError';
import { Loader2 } from 'lucide-react';

const OCCUPATIONS = ['Student', 'Teacher', 'Professional', 'Researcher', 'Other'];
const TODAY = new Date().toISOString().slice(0, 10);

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [country, setCountry] = useState('');
  const [customCountry, setCustomCountry] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const validate = () => {
    const next = {};
    if (!dateOfBirth) {
      next.dateOfBirth = 'Select your date of birth';
    } else if (dateOfBirth > TODAY) {
      next.dateOfBirth = 'Date of birth cannot be in the future';
    }
    if (!country) next.country = 'Select your country';
    if (country === 'Other' && !customCountry.trim()) {
      next.customCountry = 'Enter your country name';
    }
    const occ = occupation === 'Other' ? customOccupation.trim() : occupation;
    if (!occ) next.occupation = 'Enter your occupation';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    const occ = occupation === 'Other' ? customOccupation.trim() : occupation;
    const continent = getContinentForCountry(country, customCountry.trim());
    setSubmitting(true);
    try {
      await client.post('/auth/onboarding', {
        date_of_birth: dateOfBirth,
        country,
        custom_country: country === 'Other' ? customCountry.trim() : null,
        continent,
        occupation: occ,
      });
      await refreshUser();
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not save your profile'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-heading font-bold text-foreground">Before you get started…</h1>
        <p className="mt-2 text-sm text-muted-foreground">Help us personalize your experience</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of birth *</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              max={TODAY}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            {errors.dateOfBirth && <p className="text-sm text-destructive">{errors.dateOfBirth}</p>}
          </div>

          <div className="space-y-2">
            <Label>Country *</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.country && <p className="text-sm text-destructive">{errors.country}</p>}
            {country === 'Other' && (
              <Input
                value={customCountry}
                onChange={(e) => setCustomCountry(e.target.value)}
                placeholder="Country name *"
                className="mt-2"
              />
            )}
            {errors.customCountry && <p className="text-sm text-destructive">{errors.customCountry}</p>}
          </div>

          <div className="space-y-2">
            <Label>Occupation *</Label>
            <Select value={occupation} onValueChange={setOccupation}>
              <SelectTrigger>
                <SelectValue placeholder="Select occupation" />
              </SelectTrigger>
              <SelectContent>
                {OCCUPATIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {occupation === 'Other' && (
              <Input
                value={customOccupation}
                onChange={(e) => setCustomOccupation(e.target.value)}
                placeholder="Your occupation"
                className="mt-2"
              />
            )}
            {errors.occupation && <p className="text-sm text-destructive">{errors.occupation}</p>}
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button type="submit" className="w-full h-11" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Continue to Dashboard'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
