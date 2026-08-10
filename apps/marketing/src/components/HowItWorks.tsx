'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';

const steps = [
  {
    title: 'Upload a chapter',
    body: 'PDF, e-book, or pasted notes. Any subject.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    title: 'Mindflip converts it',
    body: 'AI extracts the key concepts and builds flashcards and quizzes automatically in under a minute.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    title: 'Review daily, remember forever',
    body: 'Spaced repetition schedules exactly what to review and when, so knowledge sticks with just minutes a day.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

function StepCard({ step, index }: { step: (typeof steps)[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      className="relative flex flex-col items-center text-center"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-indigo-600 shadow-lg shadow-indigo-100/70">
        {step.icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
      <p className="mt-2 max-w-xs text-sm text-gray-600">{step.body}</p>
    </motion.div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-[#f8f8fc] px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center"><p className="eyebrow">How it works</p><h2 className="mt-5 text-4xl font-black tracking-[-0.045em] text-gray-950 sm:text-6xl">From chapter to long-term memory.</h2><p className="mt-5 text-lg leading-8 text-gray-600">A study workflow that removes setup friction and puts active recall at the center.</p></div>

        <div className="relative mt-16 hidden md:grid md:grid-cols-3 md:gap-8">
          <div
            className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-8 border-t-2 border-dashed border-indigo-200"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-[16.67%] top-[1.65rem] text-indigo-300"
            aria-hidden
          >
            →
          </span>
          {steps.map((step, i) => (
            <StepCard key={step.title} step={step} index={i} />
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-12 md:hidden">
          {steps.map((step, i) => (
            <StepCard key={step.title} step={step} index={i} />
          ))}
        </div>
        <div className="mt-14 text-center"><Link href="/how-it-works" className="button-secondary">Explore the complete learning loop →</Link></div>
      </div>
    </section>
  );
}
