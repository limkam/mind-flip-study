import { subjects } from '@/lib/subjects';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HowItWorks } from '@/components/HowItWorks';
import { CTABanner } from '@/components/CTABanner';
import { FAQ } from '@/components/FAQ';
import type { FAQItem } from '@/components/FAQ';

export async function generateStaticParams() {
  return subjects.map((s) => ({ subject: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { subject: string };
}): Promise<Metadata> {
  const subject = subjects.find((s) => s.slug === params.subject);
  if (!subject) return {};
  return {
    title: `${subject.name} Flashcard Generator — AI Study Cards`,
    description: subject.description,
    keywords: subject.keywords,
    alternates: { canonical: `https://mindflip.io/study/${subject.slug}` },
    openGraph: {
      title: `${subject.name} Flashcard Generator`,
      description: subject.description,
      url: `https://mindflip.io/study/${subject.slug}`,
    },
  };
}

function subjectFaq(subjectName: string): FAQItem[] {
  return [
    {
      q: `How does the ${subjectName} flashcard generator work?`,
      a: `Upload your ${subjectName} PDF — textbook chapters, lecture slides, or notes. MindFlip's AI reads the content and generates targeted question-and-answer flashcards in under 30 seconds.`,
    },
    {
      q: `Is it better than Anki for ${subjectName}?`,
      a: 'MindFlip uses the same SM-2 spaced repetition algorithm as Anki, but adds 8 game modes to make studying less passive. No manual card creation required.',
    },
    {
      q: `How many ${subjectName} flashcards can I generate?`,
      a: 'Free accounts get 3 sets of 20 cards. Student plan ($8/month) is unlimited.',
    },
  ];
}

export default function SubjectPage({ params }: { params: { subject: string } }) {
  const subject = subjects.find((s) => s.slug === params.subject);
  if (!subject) notFound();

  return (
    <div>
      <section className="px-6 py-24 text-center">
        <div
          className={`mb-6 inline-block rounded-full bg-gradient-to-r ${subject.color} px-4 py-1 text-sm font-medium text-white`}
        >
          {subject.name}
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight text-gray-900">
          {subject.name} Flashcard Generator
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl text-gray-600">
          {subject.description} Upload your notes and get study-ready cards in 30 seconds.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <a
            href="https://app.mindflip.io/register"
            className="rounded-xl bg-indigo-600 px-8 py-4 font-semibold text-white transition hover:bg-indigo-700"
          >
            Generate {subject.name} Flashcards Free
          </a>
        </div>
      </section>

      <section className="bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Popular {subject.name} Topics
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {subject.sampleTopics.map((topic) => (
              <div
                key={topic}
                className="rounded-xl border border-gray-200 bg-white p-4 text-center font-medium"
              >
                {topic}
              </div>
            ))}
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-8 text-3xl font-bold">{subject.name} Flashcard FAQ</h2>
        <FAQ items={subjectFaq(subject.name)} />
      </section>

      <CTABanner />
    </div>
  );
}
