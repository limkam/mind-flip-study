import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import client from '@/api/client';

export default function PageNotFound() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    client.get('/users/me').then((r) => setUser(r.data)).catch(() => setUser(null));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 mb-6">
          <span className="text-4xl font-bold text-slate-400 dark:text-slate-500">404</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Page not found</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={user ? '/' : '/login'}>
            <Button variant="default" className="w-full sm:w-auto">
              {user ? 'Back to Dashboard' : 'Sign in'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
