import { APP_REGISTER_URL } from '@/lib/constants';

export function CTABanner() {
  return (
    <section className="noise relative overflow-hidden bg-[#11142c] px-6 py-24 text-center text-white sm:py-32">
      <div className="absolute left-1/2 top-0 h-80 w-[50rem] -translate-x-1/2 rounded-full bg-indigo-600/40 blur-[110px]" />
      <div className="relative mx-auto max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">Start with one chapter</p>
        <h2 className="mt-5 text-balance text-4xl font-black tracking-[-0.045em] sm:text-6xl">Your next exam is coming either way.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          Upload your first chapter free and see what Mindflip builds in 60 seconds.
        </p>
        <a
          href={APP_REGISTER_URL}
          className="mt-9 inline-flex rounded-full bg-white px-8 py-4 font-bold text-indigo-700 shadow-xl transition hover:-translate-y-1 hover:bg-indigo-50"
        >
          Start free
        </a>
      </div>
    </section>
  );
}
