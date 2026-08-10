'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="section-shell grid min-h-[65vh] place-items-center py-24 text-center">
      <div className="max-w-xl">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
          This page hit a temporary snag.
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          Your place is safe. Try loading the page again.
        </p>
        <button type="button" onClick={reset} className="button-primary mt-8">
          Try again
        </button>
      </div>
    </section>
  );
}
