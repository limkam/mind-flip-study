'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const steps = [
  {
    title: 'Upload Any PDF',
    body: "Textbooks, lecture notes, papers — if it's a PDF, MindFlip can learn from it.",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    title: 'AI Creates Your Study Set',
    body: 'Claude AI reads your content and generates targeted flashcards in under 30 seconds.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    title: 'Study With 8 Games',
    body: 'Hangman, Memory Match, Battle RPG, Lightning Round and 4 more. Learning should be fun.',
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
        {step.icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
      <p className="mt-2 max-w-xs text-sm text-gray-600">{step.body}</p>
    </motion.div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-gray-50 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          From textbook to test-ready in three steps
        </h2>

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
      </div>
    </section>
  );
}
