import type { Metadata } from 'next';
import { PageHero } from '@/components/MarketingUI';
import { PricingSection } from '@/components/PricingSection';
import { FAQ } from '@/components/FAQ';
import { CTABanner } from '@/components/CTABanner';

export const metadata: Metadata = { title: 'Pricing', description: 'Flexible Mindflip plans for everyday learning and serious exam preparation.', alternates: { canonical: 'https://mindflip.io/pricing' } };

const faqs=[
  {q:'Can I start without a card?',a:'Yes. The Free plan lets you experience the core learning workflow without entering payment details.'},
  {q:'Can I change plans later?',a:'Yes. You can manage your subscription as your course load changes.'},
  {q:'What happens to my cards if I cancel?',a:'Your existing learning content remains associated with your account. Free-plan limits apply to new generation and daily usage.'},
  {q:'Which plan is best for a full semester?',a:'Standard 15 is the balanced choice for regular coursework, while Premium 30 supports heavier reading and generation volume.'},
];

export default function PricingPage(){return <><PageHero eyebrow="Simple, flexible pricing" title="Choose the pace that fits" accent="your semester." description="Start free. Upgrade when your workload grows. Every plan keeps active recall and thoughtful review at the center."/><PricingSection showIntro={false}/><section className="section-shell py-24"><div className="mx-auto max-w-3xl"><p className="eyebrow">Pricing questions</p><h2 className="mt-5 text-4xl font-black tracking-tight">Clear answers before you choose.</h2><div className="mt-10"><FAQ items={faqs}/></div></div></section><CTABanner/></>}
