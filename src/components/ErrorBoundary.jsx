import React from 'react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.VITE_SENTRY_DSN) {
      import('@sentry/react')
        .then((Sentry) => {
          Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
        })
        .catch(() => {});
    }
    if (import.meta.env.DEV) {
      console.error(error, info);
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="font-heading text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground text-sm max-w-md mb-6">
            This part of the app hit an unexpected error. You can try again or go back to the dashboard.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button type="button" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.assign('/')}>
              Go home
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
