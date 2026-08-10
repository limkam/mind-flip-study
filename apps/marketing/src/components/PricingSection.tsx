'use client';

import { useState } from 'react';
import { APP_REGISTER_URL } from '@/lib/constants';
import {
  comparisonRows,
  planAnnualMonthlyEquivalents,
  planAnnualPrices,
  planLabels,
  planOrder,
  planPrices,
  planTaglines,
  recommendedPlanSlug,
} from '@/lib/pricing';

type BillingInterval = 'monthly' | 'annual';

export function PricingSection({ showIntro = true }: { showIntro?: boolean }) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  return (
    <section id="pricing" className="scroll-mt-24 bg-[#f8f8fc] px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        {showIntro && <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">Choose your pace</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-5xl">Simple pricing. Serious results.</h2>
          <p className="mt-4 text-lg text-gray-600">Start free, then choose the study capacity that fits your semester.</p>
        </div>}
        <div className={`${showIntro ? 'mt-10' : 'mt-2'} flex flex-col items-center gap-3`}>
          <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm" aria-label="Billing interval">
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              aria-pressed={billingInterval === 'monthly'}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${billingInterval === 'monthly' ? 'bg-gray-950 text-white shadow-sm' : 'text-gray-600 hover:text-gray-950'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('annual')}
              aria-pressed={billingInterval === 'annual'}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${billingInterval === 'annual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-950'}`}
            >
              Annual
            </button>
          </div>
          <p className="text-sm font-semibold text-emerald-700">Choose annual billing and save about 50%</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {planOrder.map((slug) => {
            const recommended = slug === recommendedPlanSlug;
            return <article key={slug} className={`relative flex flex-col rounded-[1.75rem] border bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl ${recommended ? 'border-indigo-500 ring-1 ring-indigo-200 shadow-xl shadow-indigo-100' : 'border-gray-200'}`}>
              {recommended && <span className="absolute left-6 top-0 -translate-y-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Most popular</span>}
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">{planLabels[slug]}</p>
              {billingInterval === 'monthly' || slug === 'free' ? (
                <p className="mt-4 text-4xl font-bold text-gray-950">{planPrices[slug]}<span className="ml-1 text-base font-medium text-gray-500">/month</span></p>
              ) : (
                <div className="mt-4">
                  <p className="text-4xl font-bold text-gray-950">{planAnnualMonthlyEquivalents[slug]}<span className="ml-1 text-base font-medium text-gray-500">/month</span></p>
                  <p className="mt-1 text-sm font-semibold text-emerald-700">{planAnnualPrices[slug]} paid annually</p>
                </div>
              )}
              <p className="mt-4 min-h-[64px] text-sm leading-6 text-gray-600">{planTaglines[slug]}</p>
              <dl className="mb-7 mt-5 divide-y divide-gray-100 border-y border-gray-100 text-sm">
                {comparisonRows.map((row) => (
                  <div key={row.label} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <dt className="text-gray-500">{row.label}</dt>
                    <dd className={`shrink-0 text-right font-semibold ${row.values[slug] === 'Not included' ? 'text-gray-400' : 'text-gray-900'}`}>
                      {row.values[slug]}
                    </dd>
                  </div>
                ))}
              </dl>
              <a href={`${APP_REGISTER_URL}?plan=${slug}&interval=${billingInterval}`} className={`mt-auto block rounded-full px-4 py-3 text-center font-semibold transition ${recommended ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700' : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>{slug === 'free' ? 'Start free' : `Choose ${planLabels[slug]}`}</a>
              <p className="mt-3 text-center text-xs text-gray-500">{slug === 'free' ? 'No card required' : billingInterval === 'annual' ? 'One payment for 12 months' : 'Cancel anytime'}</p>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}
