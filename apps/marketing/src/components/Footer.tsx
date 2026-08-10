import Link from 'next/link';
import { DownloadBadges } from '@/components/DownloadBadges';
import { subjects } from '@/lib/subjects';

const footerStudySlugs = ['biology', 'mathematics', 'history', 'chemistry', 'psychology'];

export function Footer() {
  const studyLinks = subjects.filter((s) => footerStudySlugs.includes(s.slug));

  return (
    <footer className="border-t border-gray-200 bg-[#0e1024] px-6 py-16 text-white">
      <div className="mx-auto grid max-w-7xl gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5 text-xl font-black tracking-[-0.04em]">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-xs font-black text-white shadow-md shadow-indigo-500/20 rotate-[30deg] my-1 ml-1">
              <span className="-rotate-[30deg]">M</span>
            </span>
            <span>Mind<span className="text-indigo-400">flip</span></span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">
            Turn your course material into a study system that helps knowledge stick.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white">Product</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li>
              <Link href="/features" className="hover:text-white">
                Features
              </Link>
            </li>
            <li>
              <Link href="/how-it-works" className="hover:text-white">How it works</Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-white">
                Pricing
              </Link>
            </li>
            <li className="pt-2">
              <DownloadBadges size="small" />
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white">Study</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            {studyLinks.map((s) => (
              <li key={s.slug}>
                <Link href={`/study/${s.slug}`} className="hover:text-white">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white">Support</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li><Link href="/help" className="hover:text-white">Help center</Link></li>
            <li>
              <Link href="/privacy" className="hover:text-white">
                Privacy Policy
              </Link>
            </li>
            <li>
              <a href="mailto:hello@mindflip.io" className="hover:text-white">
                Contact
              </a>
            </li>
            <li>
              <a
                href="https://twitter.com/mindflipapp"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                @mindflipapp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Mindflip. Learn with momentum.
      </p>
    </footer>
  );
}
