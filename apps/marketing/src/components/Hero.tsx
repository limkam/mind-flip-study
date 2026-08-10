'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { APP_REGISTER_URL } from '@/lib/constants';

const ease = [0.22, 1, 0.36, 1] as const;

function Arrow({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

function StudyWorkspace() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.25, ease }}
      className="relative mx-auto w-full max-w-[620px] [perspective:1200px]"
      aria-label="Mindflip study workspace preview"
    >
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} className="absolute -left-7 top-20 z-20 hidden rounded-2xl border border-white/80 bg-white/90 p-3 shadow-xl backdrop-blur md:block">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ready to review</p>
        <p className="mt-1 text-sm font-extrabold text-gray-900">24 smart cards</p>
      </motion.div>
      <motion.div animate={{ y: [0, 9, 0] }} transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }} className="absolute -right-5 bottom-16 z-20 hidden items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-xl backdrop-blur md:flex">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-100">🔥</span><div><p className="text-[10px] font-bold uppercase text-gray-400">Study streak</p><p className="text-sm font-extrabold">7 days strong</p></div>
      </motion.div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/85 p-2 shadow-[0_35px_100px_rgba(76,62,170,0.22)] backdrop-blur-xl">
        <div className="overflow-hidden rounded-[1.35rem] border border-indigo-100/80 bg-[#f8f8fc]">
          <div className="flex items-center justify-between border-b border-gray-200/80 bg-white px-4 py-3">
            <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400"/><span className="h-2.5 w-2.5 rounded-full bg-amber-400"/><span className="h-2.5 w-2.5 rounded-full bg-emerald-400"/></div>
            <div className="rounded-full bg-gray-100 px-4 py-1 text-[10px] font-semibold text-gray-500">Neuroscience • Chapter 6</div>
            <span className="h-6 w-6 rounded-full bg-indigo-100" />
          </div>
          <div className="grid min-h-[390px] grid-cols-[74px_1fr] sm:grid-cols-[150px_1fr]">
            <aside className="border-r border-gray-200 bg-[#11142c] p-3 text-white sm:p-4">
              <div className="hidden sm:flex items-center gap-2 text-xs font-black text-white">
                <span className="grid h-5 w-5 place-items-center rounded bg-indigo-500 text-[9px] font-black text-white rotate-[30deg] my-0.5 ml-0.5">
                  <span className="-rotate-[30deg]">M</span>
                </span>
                <span>Mind<span className="text-indigo-400">flip</span></span>
              </div>
              <div className="mt-7 space-y-2">
                {['Overview','Flashcards','Quiz','Games'].map((item, i) => <div key={item} className={`rounded-lg px-2 py-2 text-[10px] font-semibold sm:px-3 ${i === 1 ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}><span className="sm:hidden">{['◫','◇','✓','✦'][i]}</span><span className="hidden sm:inline">{item}</span></div>)}
              </div>
            </aside>
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Daily review</p><h3 className="mt-1 text-lg font-black text-gray-950 sm:text-xl">Neural communication</h3></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">12 due</span></div>
              <div className="mt-5 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400"><span>Card 4 of 12</span><span className="text-indigo-600">Concept</span></div>
                <p className="mt-8 text-center text-base font-bold leading-7 text-gray-900 sm:text-lg">What carries signals between neurons?</p>
                <div className="mx-auto mt-7 h-px w-16 bg-indigo-100" />
                <p className="mt-5 text-center text-xs text-gray-400">Tap to reveal the answer</p>
                <div className="mt-7 grid grid-cols-3 gap-2"><span className="rounded-lg bg-rose-50 py-2 text-center text-[10px] font-bold text-rose-600">Again</span><span className="rounded-lg bg-amber-50 py-2 text-center text-[10px] font-bold text-amber-600">Hard</span><span className="rounded-lg bg-emerald-50 py-2 text-center text-[10px] font-bold text-emerald-600">Got it</span></div>
              </div>
              <div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200"><motion.div initial={{ width: 0 }} animate={{ width: '34%' }} transition={{ delay: 1, duration: 1 }} className="h-full rounded-full bg-indigo-500" /></div><span className="text-[10px] font-bold text-gray-400">34%</span></div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="noise relative overflow-hidden pb-24 pt-16 sm:pt-24 lg:pb-32">
      <div className="site-grid pointer-events-none absolute inset-0 -z-20" />
      <div className="pointer-events-none absolute -left-40 top-20 -z-10 h-[32rem] w-[32rem] rounded-full bg-indigo-200/50 blur-[100px]" />
      <div className="pointer-events-none absolute -right-40 top-0 -z-10 h-[32rem] w-[32rem] rounded-full bg-emerald-100/60 blur-[110px]" />
      <div className="section-shell grid items-center gap-16 lg:grid-cols-[0.92fr_1.08fr]">
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }} className="text-center lg:text-left">
          <motion.p variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }} className="eyebrow"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Your material. Your study system.</motion.p>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } }} className="mt-7 text-balance text-5xl font-black tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-[4.75rem] lg:leading-[0.99]">Study smarter, <span className="gradient-text">remember more.</span></motion.h1>
          <motion.p variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease } } }} className="mx-auto mt-7 max-w-xl text-lg leading-8 text-gray-600 lg:mx-0">Mindflip transforms textbooks, PDFs, and notes into intelligent flashcards, adaptive quizzes, and review sessions timed for when your memory needs them most.</motion.p>
          <motion.div variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease } } }} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <a href={APP_REGISTER_URL} className="button-primary group">Build my first study set <Arrow className="ml-2 h-4 w-4 transition group-hover:translate-x-1" /></a>
            <Link href="/how-it-works" className="button-secondary">See how it works</Link>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.7 } } }} className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-gray-500 lg:justify-start"><span>✓ Free to start</span><span>✓ No card required</span><span>✓ Private by default</span></motion.div>
        </motion.div>
        <StudyWorkspace />
      </div>
    </section>
  );
}
