import { FAQ } from '@/components/FAQ';
import { APP_REGISTER_URL } from '@/lib/constants';

const freeFeatures = [
  '3 PDF uploads',
  '3 flashcard sets',
  '20 cards per set',
  'All 8 games',
  'Spaced repetition',
  'Leaderboard',
];

const studentFeatures = [
  'Unlimited PDF uploads',
  'Unlimited flashcard sets',
  'Unlimited cards',
  'All 8 games',
  'Spaced repetition',
  'Leaderboard',
  'Priority AI generation',
  'Offline study mode',
];

const pricingFaq = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your profile — no questions asked.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDF. More formats coming soon.',
  },
  {
    q: 'Is there a student discount?',
    a: "$8/month IS the student discount. That's the only plan.",
  },
];

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="mt-0.5 text-indigo-600" aria-hidden>
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PricingSection({ showFaq = true }: { showFaq?: boolean }) {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Simple, honest pricing
        </h2>
        <p className="mt-4 text-center text-gray-600">No hidden fees. Cancel anytime.</p>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-gray-200 bg-white p-8">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Free forever
            </span>
            <p className="mt-4 text-4xl font-bold text-gray-900">
              $0<span className="text-lg font-normal text-gray-500">/month</span>
            </p>
            <CheckList items={freeFeatures} />
            <a
              href={APP_REGISTER_URL}
              className="mt-8 block rounded-xl border-2 border-indigo-600 py-3 text-center font-semibold text-indigo-600 transition hover:bg-indigo-50"
            >
              Get Started
            </a>
          </div>

          <div className="relative rounded-2xl border-2 border-transparent bg-gradient-to-b from-white to-indigo-50/30 bg-white p-8 shadow-lg ring-2 ring-indigo-500 ring-offset-2">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
              Most Popular
            </span>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Student
            </span>
            <p className="mt-4 text-4xl font-bold text-gray-900">
              $8<span className="text-lg font-normal text-gray-500">/month</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">or $72/year (save 25%)</p>
            <CheckList items={studentFeatures} />
            <a
              href={APP_REGISTER_URL}
              className="mt-8 block rounded-xl bg-indigo-600 py-3 text-center font-semibold text-white transition hover:bg-indigo-700"
            >
              Start Free Trial
            </a>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-gray-600">
          Questions? Email us at{' '}
          <a href="mailto:hello@mindflip.io" className="font-medium text-indigo-600 hover:underline">
            hello@mindflip.io
          </a>
        </p>

        {showFaq && (
          <div className="mt-12">
            <FAQ items={pricingFaq} />
          </div>
        )}
      </div>
    </section>
  );
}
