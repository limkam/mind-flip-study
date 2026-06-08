import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How MindFlip collects, uses, and protects your data.',
  alternates: { canonical: 'https://mindflip.io/privacy' },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-gray">
      <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-4 text-gray-600">Last updated: May 17, 2025</p>

      <section className="mt-10 space-y-4 text-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900">Overview</h2>
        <p>
          MindFlip (&quot;we&quot;, &quot;us&quot;) operates mindflip.io and app.mindflip.io. This policy
          explains what information we collect when you use our study app and marketing site, and how we
          use it.
        </p>

        <h2 className="text-2xl font-semibold text-gray-900 pt-6">Information we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Account information: email, name, and password (hashed).</li>
          <li>Study content: PDFs you upload and flashcard sets you create.</li>
          <li>Usage data: games played, scores, and study streaks to power spaced repetition.</li>
          <li>Payment data: processed by Stripe; we do not store full card numbers.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-gray-900 pt-6">How we use your data</h2>
        <p>
          We use your data to generate flashcards, run study games, send transactional emails you
          request (welcome, password reset, streak reminders), and improve the product. We do not sell
          your personal information.
        </p>

        <h2 className="text-2xl font-semibold text-gray-900 pt-6">Third parties</h2>
        <p>
          We use Anthropic (Claude) for AI generation, Stripe for billing, Resend for email, and
          hosting providers for infrastructure. Each processes data under their own privacy policies.
        </p>

        <h2 className="text-2xl font-semibold text-gray-900 pt-6">Your rights</h2>
        <p>
          You may export or delete your account from the app settings, or contact us at{' '}
          <a href="mailto:hello@mindflip.io" className="text-indigo-600 hover:underline">
            hello@mindflip.io
          </a>
          .
        </p>

        <h2 className="text-2xl font-semibold text-gray-900 pt-6">Contact</h2>
        <p>
          Questions about this policy:{' '}
          <a href="mailto:hello@mindflip.io" className="text-indigo-600 hover:underline">
            hello@mindflip.io
          </a>
        </p>
      </section>
    </article>
  );
}
