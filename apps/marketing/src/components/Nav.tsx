'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DownloadBadges } from '@/components/DownloadBadges';
import { APP_REGISTER_URL } from '@/lib/constants';

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/85 backdrop-blur-[12px]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-indigo-600">
          MindFlip
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
          <DownloadBadges size="small" />
          <a
            href={APP_REGISTER_URL}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Get Started Free
          </a>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </nav>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            aria-label="Close menu overlay"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-72 max-w-[85vw] flex-col gap-6 border-l border-gray-200 bg-white p-6 shadow-xl lg:hidden">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-indigo-600">Menu</span>
              <button
                type="button"
                className="rounded-lg p-2 text-gray-600"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium text-gray-700"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <DownloadBadges />
            <a
              href={APP_REGISTER_URL}
              className="mt-auto rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Get Started Free
            </a>
          </aside>
        </>
      )}
    </header>
  );
}
