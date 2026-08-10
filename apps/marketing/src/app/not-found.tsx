import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section-shell grid min-h-[65vh] place-items-center py-24 text-center">
      <div className="max-w-xl">
        <p className="eyebrow">404: Page not found</p>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
          This page has wandered off.
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          Head back home or continue exploring how Mindflip works.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="button-primary">Back home</Link>
          <Link href="/how-it-works" className="button-secondary">How it works</Link>
        </div>
      </div>
    </section>
  );
}
