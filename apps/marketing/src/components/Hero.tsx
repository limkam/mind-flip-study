'use client';

import { useState } from 'react';
import { DownloadBadges } from '@/components/DownloadBadges';
import { SocialProof } from '@/components/SocialProof';
import { APP_REGISTER_URL } from '@/lib/constants';

export function Hero() {
  const [videoError, setVideoError] = useState(false);

  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 lg:min-h-[90vh] lg:pb-28 lg:pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50/80 via-white to-white" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="mb-4 inline-block rounded-full bg-indigo-100 px-4 py-1 text-sm font-medium text-indigo-700">
            Now available on iOS &amp; Android
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-[3.25rem] lg:leading-tight">
            Turn Any Textbook Into a Study Game in 30 Seconds.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-gray-600 lg:mx-0">
            Upload a PDF. MindFlip&apos;s AI generates flashcards and 8 interactive games instantly.
            Study smarter with spaced repetition that actually adapts to you.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
            <a
              href={APP_REGISTER_URL}
              className="w-full rounded-xl bg-indigo-600 px-8 py-4 text-center font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 sm:w-auto"
            >
              Start for Free
            </a>
            <a
              href="#how-it-works"
              className="w-full rounded-xl border border-gray-300 bg-white px-8 py-4 text-center font-semibold text-gray-800 transition hover:border-gray-400 sm:w-auto"
            >
              See How It Works
            </a>
          </div>
          <div className="mt-8 flex justify-center lg:justify-start">
            <DownloadBadges />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div
            className="relative w-[min(100%,390px)] -rotate-2 overflow-hidden rounded-[2rem] border border-gray-200 bg-gray-900 shadow-2xl shadow-indigo-200/50"
            style={{ aspectRatio: '390 / 844' }}
          >
            {!videoError ? (
              <video
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
                onError={() => setVideoError(true)}
              >
                <source src="/videos/hero-demo.mp4" type="video/mp4" />
              </video>
            ) : (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 p-8 text-center text-white">
                <p className="text-lg font-semibold">Demo video coming soon</p>
                <p className="mt-2 text-sm text-indigo-100">Upload → generate → play in seconds</p>
              </div>
            )}
          </div>
          <div className="mt-10 w-full">
            <SocialProof />
          </div>
        </div>
      </div>
    </section>
  );
}
