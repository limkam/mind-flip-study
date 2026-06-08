import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { FeatureGrid } from '@/components/FeatureGrid';
import { PricingSection } from '@/components/PricingSection';
import { CTABanner } from '@/components/CTABanner';

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <PricingSection />
      <CTABanner />
    </>
  );
}
