import Link from 'next/link';
import { Reveal } from '@/components/MarketingUI';

const features = [
  { icon: '✦', className: 'md:col-span-2 bg-indigo-600 text-white', title: 'AI that studies your material, not the internet', body: 'Mindflip identifies the concepts, relationships, and exam-worthy details inside your own files, then turns them into a complete active-recall system.', tag: 'AI study engine' },
  { icon: '◷', className: 'bg-[#eafaf6]', title: 'Review at the right moment', body: 'A spaced-repetition queue adapts to every answer, so your time goes where it makes the biggest difference.', tag: 'Adaptive review' },
  { icon: '◎', className: 'bg-[#fff6e8]', title: 'Practice before it counts', body: 'Build confidence with quizzes and scenarios generated directly from the content you need to know.', tag: 'Exam practice' },
  { icon: '↗', className: 'md:col-span-2 bg-[#11142c] text-white', title: 'Momentum you can actually feel', body: 'Goals, streaks, groups, and progress signals make consistent study easier without turning learning into noise.', tag: 'Motivation, thoughtfully applied' },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-24 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div className="max-w-3xl"><p className="eyebrow">One connected learning loop</p><h2 className="mt-5 text-4xl font-black tracking-[-0.045em] text-gray-950 sm:text-6xl">Less busywork.<br/>More learning that sticks.</h2></div><Link href="/features" className="font-bold text-indigo-600 hover:text-indigo-800">Explore every feature →</Link></Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {features.map((feature, index) => <Reveal key={feature.title} delay={index * 0.06} className={feature.className}><article className="group flex h-full min-h-[290px] flex-col rounded-[2rem] border border-black/5 p-8 shadow-sm transition duration-500 hover:-translate-y-1 hover:shadow-xl"><div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl" aria-hidden>{feature.icon}</span><span className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">{feature.tag}</span></div><div className="mt-auto pt-12"><h3 className="text-2xl font-black tracking-tight">{feature.title}</h3><p className={`mt-3 max-w-xl leading-7 ${feature.className.includes('text-white') ? 'text-white/70' : 'text-gray-600'}`}>{feature.body}</p></div></article></Reveal>)}
        </div>
      </div>
    </section>
  );
}
