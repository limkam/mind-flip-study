import type { Metadata } from 'next';
import { PricingSection } from '@/components/PricingSection';
import { CTABanner } from '@/components/CTABanner';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple pricing for students. Free forever or Student plan at $8/month.',
  alternates: { canonical: 'https://mindflip.io/pricing' },
};

export default function PricingPage() {
  return (
    <>
      <div className="px-6 pt-16 pb-4 text-center">
        <h1 className="text-4xl font-bold text-gray-900">Pricing</h1>
        <p className="mt-3 text-gray-600">Two plans. No surprises.</p>
      </div>
      <PricingSection />
      <CTABanner />
    </>
  );
}
