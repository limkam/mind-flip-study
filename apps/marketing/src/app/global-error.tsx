'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-white px-6 text-center text-gray-950">
        <main className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">
            Bilkeys
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight">
            We couldn&apos;t load this page.
          </h1>
          <p className="mt-4 text-gray-600">Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-8 rounded-full bg-indigo-600 px-6 py-3 font-bold text-white"
          >
            Reload page
          </button>
        </main>
      </body>
    </html>
  );
}
