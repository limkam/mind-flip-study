import Link from 'next/link';
import { DownloadBadges } from '@/components/DownloadBadges';
import { subjects } from '@/lib/subjects';

const footerStudySlugs = ['biology', 'mathematics', 'history', 'chemistry', 'psychology'];

export function Footer() {
  const studyLinks = subjects.filter((s) => footerStudySlugs.includes(s.slug));

  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-bold text-indigo-600">MindFlip</p>
          <p className="mt-2 text-sm text-gray-600">
            Turn any PDF into flashcard games in 30 seconds.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900">Product</h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-600">
            <li>
              <Link href="/#features" className="hover:text-indigo-600">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-indigo-600">
                Pricing
              </Link>
            </li>
            <li className="pt-2">
              <DownloadBadges size="small" />
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900">Study</h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-600">
            {studyLinks.map((s) => (
              <li key={s.slug}>
                <Link href={`/study/${s.slug}`} className="hover:text-indigo-600">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900">Company</h3>
          <ul className="mt-4 space-y-2 text-sm text-gray-600">
            <li>
              <Link href="/privacy" className="hover:text-indigo-600">
                Privacy Policy
              </Link>
            </li>
            <li>
              <a href="mailto:hello@mindflip.io" className="hover:text-indigo-600">
                Contact
              </a>
            </li>
            <li>
              <a
                href="https://twitter.com/mindflipapp"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600"
              >
                @mindflipapp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-12 max-w-6xl border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
        © 2025 MindFlip. Made for students, by students.
      </p>
    </footer>
  );
}
