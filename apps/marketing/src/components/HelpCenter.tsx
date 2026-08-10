'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import rawGuideContent from '@shared/guide/userGuideContent.json';

const articles = rawGuideContent.articles.map((art) => {
  const categoryObj = rawGuideContent.categories.find((c) => c.id === art.categoryId);
  return {
    id: art.id,
    category: categoryObj ? categoryObj.title : 'General',
    title: art.title,
    body: art.summary,
    articleType: art.articleType || 'reference',
    steps: art.steps || [],
    sections: art.sections || [],
  };
});

const icon: Record<string, string> = {
  'Getting Started': '↗',
  'Studying & Spaced Repetition': '◇',
  'XP & Leaderboard System': '⚡',
  'Social & Challenges': '👥',
  'Progress & Scorecards': '📊',
  'Account & Subscriptions': '◎',
};

const getBadgeLabel = (type: string) => {
  switch (type) {
    case 'walkthrough':
      return '▶ Guided Walkthrough';
    case 'visual_explanation':
      return '◎ Visual Explanation';
    default:
      return '≡ Reference';
  }
};

export function HelpCenter() {
  const [query, setQuery] = useState('');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? articles.filter((a) => {
          const inBasic = `${a.title} ${a.body} ${a.category}`.toLowerCase().includes(q);
          const inSteps = a.steps.some(
            (st) => st.title.toLowerCase().includes(q) || st.description.toLowerCase().includes(q)
          );
          return inBasic || inSteps;
        })
      : articles;
  }, [query]);

  const categories = Array.from(new Set(articles.map((a) => a.category)));
  const selectedArticle = articles.find((a) => a.id === activeArticleId);

  return (
    <>
      <section className="noise relative overflow-hidden bg-[#11142c] py-24 text-white sm:py-32">
        <div className="absolute left-1/2 top-0 h-80 w-[50rem] -translate-x-1/2 rounded-full bg-indigo-600/40 blur-[100px]" />
        <div className="section-shell relative text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Mindflip User Guide</p>
          <h1 className="mt-5 text-5xl font-black tracking-[-0.05em] sm:text-7xl">How can we help?</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
            Official platform documentation for studying, spaced repetition, XP rules, leaderboards, and accounts.
          </p>
          <label className="mx-auto mt-9 flex max-w-2xl items-center gap-3 rounded-2xl bg-white px-5 py-4 text-gray-900 shadow-2xl">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeWidth="2" d="m21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
            </svg>
            <span className="sr-only">Search help articles</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveArticleId(null);
              }}
              className="w-full border-0 bg-transparent text-base outline-none placeholder:text-gray-400"
              placeholder="Search for an answer…"
            />
          </label>
        </div>
      </section>

      <section className="section-shell py-20 sm:py-28">
        {selectedArticle ? (
          <div className="space-y-6">
            <button
              onClick={() => setActiveArticleId(null)}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              ← Back to Help Center
            </button>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm space-y-6">
              <div>
                <span className="inline-block rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
                  {getBadgeLabel(selectedArticle.articleType)}
                </span>
                <h2 className="mt-3 text-3xl font-black">{selectedArticle.title}</h2>
                <p className="mt-2 text-base text-gray-600">{selectedArticle.body}</p>
              </div>

              {selectedArticle.steps.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Step-by-Step Workflow</h3>
                  <div className="grid gap-3">
                    {selectedArticle.steps.map((st, idx) => (
                      <div key={st.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                            {idx + 1}
                          </span>
                          <h4 className="font-bold text-gray-900">{st.title}</h4>
                        </div>
                        <p className="pl-8 text-sm text-gray-600">{st.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedArticle.sections.length > 0 && (
                <div className="space-y-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Detailed Reference</h3>
                  {selectedArticle.sections.map((sec, idx) => (
                    <div key={idx} className="space-y-2">
                      <h4 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-emerald-600">✓</span> {sec.heading}
                      </h4>
                      <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-line pl-5">{sec.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {!query && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setQuery(category)}
                    className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-xl font-black text-indigo-600">
                      {icon[category] || '◇'}
                    </span>
                    <h2 className="mt-5 font-black">{category}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {articles.filter((a) => a.category === category).length} helpful guides
                    </p>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-14">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                    {query ? 'Search results' : 'Popular guides'}
                  </p>
                  <h2 className="mt-2 text-3xl font-black">
                    {results.length ? `${results.length} ${results.length === 1 ? 'answer' : 'answers'}` : 'No answers found'}
                  </h2>
                </div>
                {query && (
                  <button onClick={() => setQuery('')} className="text-sm font-bold text-indigo-600">
                    Clear search
                  </button>
                )}
              </div>
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                {results.map((article) => (
                  <article
                    key={article.title}
                    onClick={() => setActiveArticleId(article.id)}
                    className="group cursor-pointer rounded-2xl border border-gray-200 p-6 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{article.category}</p>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {getBadgeLabel(article.articleType)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-black group-hover:text-indigo-700">{article.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{article.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-20 rounded-[2rem] bg-indigo-50 p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black">Still need help?</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-600">
            Contact our team with questions about your Mindflip account, study progress, or subscriptions.
          </p>
          <a href="mailto:hello@mindflip.io" className="button-primary mt-7">
            Contact support
          </a>
          <Link href="/privacy" className="ml-3 mt-7 inline-flex text-sm font-bold text-gray-600 hover:text-indigo-600">
            Read our privacy policy
          </Link>
        </div>
      </section>
    </>
  );
}
