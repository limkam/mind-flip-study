import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/apiError';
import { Loader2 } from 'lucide-react';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await client.post('/auth/forgot-password', { email });
      setSent(true);
      toast({
        title: 'Check your email',
        description: 'If that address is registered, we sent a reset link.',
      });
    } catch (err) {
      toast({
        title: 'Request failed',
        description: getApiErrorMessage(err, 'Could not send reset email'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div>
          <h1 className="font-heading text-2xl font-bold">Reset password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
