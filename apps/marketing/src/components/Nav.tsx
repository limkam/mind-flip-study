'use client';

import Link from 'next/link';
import { useState } from 'react';
import { APP_REGISTER_URL } from '@/lib/constants';

const navLinks = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help center' },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2.5 text-xl font-black tracking-[-0.04em] text-gray-950">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white shadow-md shadow-indigo-200 transition duration-300 group-hover:scale-110 rotate-[30deg] my-1 ml-1">
            <span className="-rotate-[30deg]">M</span>
          </span>
          <span>Mind<span className="text-indigo-600">flip</span></span>
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
          <a href={APP_REGISTER_URL.replace('/register', '/login')} className="text-sm font-semibold text-gray-600 transition hover:text-gray-950">Sign in</a>
          <a
            href={APP_REGISTER_URL}
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700"
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
              <Link href="/" className="group flex items-center gap-2.5 text-lg font-black tracking-[-0.04em] text-gray-950" onClick={() => setOpen(false)}>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-xs font-black text-white shadow-md shadow-indigo-200 rotate-[30deg] my-1 ml-1">
                  <span className="-rotate-[30deg]">M</span>
                </span>
                <span>Mind<span className="text-indigo-600">flip</span></span>
              </Link>
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
            <a href={APP_REGISTER_URL.replace('/register', '/login')} className="text-base font-medium text-gray-700">Sign in</a>
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
