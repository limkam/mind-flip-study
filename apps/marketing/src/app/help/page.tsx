import type { Metadata } from 'next';
import { HelpCenter } from '@/components/HelpCenter';

export const metadata: Metadata = { title: 'Help Center', description: 'Find answers about getting started, studying, billing, privacy, and troubleshooting in Mindflip.', alternates: { canonical: 'https://mindflip.io/help' } };

export default function HelpPage(){return <HelpCenter/>}
