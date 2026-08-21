import type { Metadata } from 'next';
import { HelpCenter } from '@/components/HelpCenter';

export const metadata: Metadata = { title: 'Help Center', description: 'Find answers about getting started, studying, billing, privacy, and troubleshooting in Bilkeys.', alternates: { canonical: 'https://bilkeys.io/help' } };

export default function HelpPage(){return <HelpCenter/>}
