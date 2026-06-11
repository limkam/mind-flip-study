import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/apiError';
import { Loader2 } from 'lucide-react';
import { MindFlipBrand } from '@/components/brand/MindFlipLogo';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { login, loginWithGoogle, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(location.state?.from?.pathname || '/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, location.state]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      toast({
        title: 'Login failed',
        description: getApiErrorMessage(err, 'Login failed'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center mb-2">
          <MindFlipBrand centered className="mb-4" />
          <h1 className="font-heading text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back to MindFlip</p>
        </div>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
          </Button>
        </form>
        {googleClientId ? (
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            <div className="flex justify-center [&>div]:w-full">
              <GoogleLogin
                width="100%"
                onSuccess={async (credentialResponse) => {
                  const token = credentialResponse.credential;
                  if (!token) {
                    toast({
                      title: 'Google sign-in failed',
                      description: 'No credential returned.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  setBusy(true);
                  try {
                    await loginWithGoogle(token);
                    navigate(location.state?.from?.pathname || '/', { replace: true });
                  } catch (err) {
                    toast({
                      title: 'Google sign-in failed',
                      description: getApiErrorMessage(err, 'Google sign-in failed'),
                      variant: 'destructive',
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
                onError={() => {
                  toast({
                    title: 'Google sign-in failed',
                    description: 'The popup was closed or sign-in was cancelled.',
                    variant: 'destructive',
                  });
                }}
                useOneTap={false}
              />
            </div>
          </div>
        ) : null}
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
