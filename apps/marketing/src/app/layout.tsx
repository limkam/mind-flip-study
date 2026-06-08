import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://mindflip.io'),
  title: {
    default: 'MindFlip — Turn Any Textbook Into a Study Game',
    template: '%s | MindFlip',
  },
  description:
    'Upload a PDF, get AI-generated flashcards and 8 study games in 30 seconds. The smarter Anki alternative.',
  keywords: [
    'AI flashcard generator',
    'flashcards from PDF',
    'Anki alternative',
    'study games',
    'spaced repetition',
  ],
  openGraph: {
    type: 'website',
    siteName: 'MindFlip',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@mindflipapp',
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://mindflip.io' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
