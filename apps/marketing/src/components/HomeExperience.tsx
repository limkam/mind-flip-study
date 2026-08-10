'use client';

import Link from 'next/link';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';

const lanes = ['Active recall', 'Adaptive quizzes', 'Spaced repetition', 'Study games', 'Smart summaries', 'Daily review', 'Learning analytics'];

function Arrow() {
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

function KineticMarquee() {
  return (
    <section className="overflow-hidden border-y border-gray-200 bg-[#11142c] py-5 text-white" aria-label="Mindflip capabilities">
      <motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }} className="flex w-max whitespace-nowrap">
        {[...lanes, ...lanes].map((lane, index) => <span key={`${lane}-${index}`} className="flex items-center text-sm font-bold uppercase tracking-[0.18em] text-slate-300"><span className="mx-7 h-1.5 w-1.5 rounded-full bg-emerald-400" />{lane}</span>)}
      </motion.div>
    </section>
  );
}

const portals = [
  { href: '/how-it-works', number: '01', label: 'The method', title: 'See learning become a repeatable system.', body: 'Follow one chapter from upload to long-term memory.', color: 'from-indigo-600 to-violet-500', visual: <div className="relative mt-10 h-44"><motion.div animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/40"/><motion.div animate={{ rotate: -360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"><span className="absolute -right-2 top-8 h-4 w-4 rounded-full bg-emerald-300 shadow-[0_0_25px_#6ee7b7]"/></motion.div><div className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-white font-black text-indigo-600 shadow-2xl">M</div></div> },
  { href: '/features', number: '02', label: 'The toolkit', title: 'Explore an engine built for active learning.', body: 'See how generation, practice, review, and momentum connect.', color: 'from-[#10283d] to-[#134e4a]', visual: <div className="relative mt-10 grid h-44 grid-cols-3 gap-2">{[48,76,58,88,65,94].map((height,index)=><motion.div key={index} initial={{ scaleY: .2 }} whileInView={{ scaleY: 1 }} transition={{ delay: index*.08, duration: .7 }} className="flex items-end rounded-xl bg-white/5 p-2"><div className={`w-full origin-bottom rounded-lg ${index%2?'bg-emerald-300':'bg-indigo-300'}`} style={{height}}/></motion.div>)}</div> },
  { href: '/pricing', number: '03', label: 'The plans', title: 'Find a pace that fits your semester.', body: 'Start free and scale your study capacity when you need it.', color: 'from-orange-500 to-rose-500', visual: <div className="relative mt-10 h-44"><motion.div animate={{ y: [0,-8,0], rotate: [-3,-1,-3] }} transition={{ duration: 4, repeat: Infinity }} className="absolute left-4 top-5 w-40 rounded-2xl bg-white/20 p-4 backdrop-blur"><p className="text-[10px] font-bold uppercase text-white/60">Start here</p><p className="mt-1 text-2xl font-black">Free</p><div className="mt-5 h-2 rounded bg-white/20"/><div className="mt-2 h-2 w-2/3 rounded bg-white/20"/></motion.div><motion.div animate={{ y: [0,8,0], rotate: [4,2,4] }} transition={{ duration: 4.7, repeat: Infinity }} className="absolute bottom-0 right-3 w-44 rounded-2xl bg-white p-4 text-gray-950 shadow-2xl"><p className="text-[10px] font-bold uppercase text-rose-500">Most popular</p><p className="mt-1 text-2xl font-black">Standard 15</p><p className="mt-3 text-xs text-gray-500">Built for a full semester</p></motion.div></div> },
  { href: '/help', number: '04', label: 'The answers', title: 'Get unstuck and keep moving.', body: 'Find direct help for setup, studying, billing, and your account.', color: 'from-sky-500 to-indigo-600', visual: <div className="mt-10 space-y-3">{['How does Daily Review work?','Can I change my plan?','My PDF did not process'].map((item,index)=><motion.div key={item} animate={{ x: index===1?[0,6,0]:[0,-4,0] }} transition={{ duration: 4+index, repeat: Infinity }} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 text-xs font-semibold backdrop-blur"><span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15">{index+1}</span>{item}</motion.div>)}</div> },
];

function PortalGrid() {
  return (
    <section className="section-shell py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center"><p className="eyebrow">Go deeper</p><h2 className="mt-5 text-balance text-4xl font-black tracking-[-0.05em] sm:text-6xl">One destination.<br/>Four ways in.</h2><p className="mt-5 text-lg leading-8 text-gray-600">The homepage is the invitation. Pick what you want to understand next.</p></div>
      <div className="mt-16 grid gap-5 lg:grid-cols-2">{portals.map((portal,index)=><motion.div key={portal.href} initial={{ opacity: 0, y: 45 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: .7, delay: (index%2)*.1, ease: [0.22,1,.36,1] }} whileHover={{ y: -8 }}><Link href={portal.href} className={`group relative block min-h-[490px] overflow-hidden rounded-[2.25rem] bg-gradient-to-br ${portal.color} p-7 text-white shadow-xl transition-shadow duration-500 hover:shadow-2xl sm:p-9`}><motion.div whileHover={{ scale: 1.08 }} className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/15 bg-white/5"/><div className="relative flex items-center justify-between"><span className="text-xs font-black tracking-[0.18em] text-white/65">{portal.number}: {portal.label}</span><span className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 transition duration-300 group-hover:rotate-[-12deg] group-hover:bg-white group-hover:text-gray-950"><Arrow/></span></div><div className="relative mt-12 max-w-lg"><h3 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">{portal.title}</h3><p className="mt-4 max-w-md leading-7 text-white/70">{portal.body}</p></div><div className="relative">{portal.visual}</div></Link></motion.div>)}</div>
    </section>
  );
}

function MemoryStory() {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start end', 'end start'] });
  const rotate = useTransform(scrollYProgress, [0,1], [-18,22]);
  const y = useTransform(scrollYProgress, [0,1], [80,-80]);
  const scale = useTransform(scrollYProgress, [0,.5,1], [.82,1,.9]);
  return (
    <section ref={section} className="noise relative overflow-hidden bg-[#11142c] py-28 text-white sm:py-40">
      <div className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/20 blur-[120px]"/>
      <div className="section-shell relative grid items-center gap-16 lg:grid-cols-2">
        <div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Designed around memory</p><h2 className="mt-6 text-balance text-5xl font-black tracking-[-0.055em] sm:text-7xl">Less cramming.<br/><span className="text-indigo-300">More arriving ready.</span></h2><p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">Mindflip closes the gap between “I read it” and “I can recall it.” Your material becomes practice, practice becomes a review schedule, and each review makes the next one smarter.</p><Link href="/how-it-works" className="mt-9 inline-flex items-center gap-2 font-bold text-white hover:text-indigo-300">Understand the method <Arrow/></Link></div>
        <motion.div style={{ rotate, y, scale }} className="relative mx-auto h-[430px] w-full max-w-[430px]"><div className="absolute inset-0 rounded-full border border-white/10"/><div className="absolute inset-12 rounded-full border border-dashed border-indigo-300/30"/><motion.div animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} className="absolute inset-20 rounded-full border border-white/20"><span className="absolute -top-3 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-emerald-300 text-xs font-black text-gray-950 shadow-[0_0_30px_rgba(110,231,183,.7)]">✓</span></motion.div><div className="absolute inset-[7rem] grid place-items-center rounded-full bg-white text-center text-gray-950 shadow-[0_30px_80px_rgba(0,0,0,.35)]"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Memory loop</p><p className="mt-2 text-3xl font-black">Recall<br/>→ Adapt<br/>→ Retain</p></div></div>{[['Create','left-2 top-1/2'],['Practice','right-0 top-1/3'],['Review','bottom-3 left-1/2']].map(([word,pos])=><motion.span key={word} animate={{ y:[0,-7,0] }} transition={{ duration:4+word.length/3,repeat:Infinity }} className={`absolute ${pos} rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur`}>{word}</motion.span>)}</motion.div>
      </div>
    </section>
  );
}

export function HomeExperience(){
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress,{ stiffness:120,damping:30,mass:.2 });
  return <><motion.div style={{ scaleX: progress }} className="fixed left-0 right-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400"/><KineticMarquee/><PortalGrid/><MemoryStory/></>;
}
