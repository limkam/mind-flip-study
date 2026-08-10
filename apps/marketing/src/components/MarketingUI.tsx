'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const visible = useInView(ref, { once: true, margin: '-70px' });
  return <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={visible ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>{children}</motion.div>;
}

export function PageHero({ eyebrow, title, accent, description }: { eyebrow: string; title: string; accent: string; description: string }) {
  return (
    <section className="noise relative overflow-hidden border-b border-gray-100 py-24 sm:py-32">
      <div className="site-grid absolute inset-0 -z-20" />
      <div className="absolute left-1/2 top-0 -z-10 h-80 w-[52rem] -translate-x-1/2 rounded-full bg-indigo-100/80 blur-[100px]" />
      <div className="section-shell text-center">
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">{eyebrow}</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.7 }} className="mx-auto mt-7 max-w-5xl text-balance text-5xl font-black tracking-[-0.055em] text-gray-950 sm:text-7xl">{title} <span className="gradient-text">{accent}</span></motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.7 }} className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-gray-600">{description}</motion.p>
      </div>
    </section>
  );
}
