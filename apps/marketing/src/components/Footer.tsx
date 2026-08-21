import Link from 'next/link';

const productHighlights = ['Study groups', 'Flashcards', 'Games', 'Daily review'];

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-[#0e1024] px-6 py-16 text-white">
      <div className="mx-auto grid max-w-7xl gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5 text-xl font-black tracking-[-0.04em]">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-xs font-black text-white shadow-md shadow-indigo-500/20 rotate-[30deg] my-1 ml-1">
              <span className="-rotate-[30deg]">B</span>
            </span>
            <span>Bil<span className="text-indigo-400">keys</span></span>
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
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white">What you get</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            {productHighlights.map((item) => (
              <li key={item}>{item}</li>
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
              <a href="mailto:hello@bilkeys.io" className="hover:text-white">
                Contact
              </a>
            </li>
            <li>
              <a
                href="https://twitter.com/bilkeysapp"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                @bilkeysapp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Bilkeys. Learn with momentum.
      </p>
    </footer>
  );
}
