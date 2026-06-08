export interface Subject {
  slug: string;
  name: string;
  description: string;
  keywords: string[];
  sampleTopics: string[];
  color: string;
}

export const subjects: Subject[] = [
  {
    slug: 'biology',
    name: 'Biology',
    description: 'Generate flashcards from biology textbooks, lab reports, and lecture notes.',
    keywords: ['biology flashcards', 'biology flashcard generator', 'AP Biology study cards'],
    sampleTopics: ['Cell division', 'DNA replication', 'Photosynthesis', 'Evolution', 'Genetics'],
    color: 'from-green-500 to-emerald-600',
  },
  {
    slug: 'mathematics',
    name: 'Mathematics',
    description: 'Turn math notes and problem sets into interactive study games.',
    keywords: ['math flashcards', 'calculus study cards', 'algebra flashcard generator'],
    sampleTopics: ['Derivatives', 'Integrals', 'Linear algebra', 'Statistics', 'Proofs'],
    color: 'from-blue-500 to-indigo-600',
  },
  {
    slug: 'chemistry',
    name: 'Chemistry',
    description: 'Master chemical equations, periodic table, and reactions with AI flashcards.',
    keywords: ['chemistry flashcards', 'chemistry flashcard generator', 'organic chemistry study'],
    sampleTopics: ['Periodic table', 'Organic reactions', 'Stoichiometry', 'Thermodynamics', 'Bonds'],
    color: 'from-orange-500 to-red-600',
  },
  {
    slug: 'history',
    name: 'History',
    description: 'Convert history notes into dates, events, and cause-effect flashcard games.',
    keywords: ['history flashcards', 'AP History study cards', 'history flashcard generator'],
    sampleTopics: ['World War II', 'Industrial Revolution', 'Cold War', 'Ancient Rome', 'Civil Rights'],
    color: 'from-amber-500 to-yellow-600',
  },
  {
    slug: 'psychology',
    name: 'Psychology',
    description: 'Study theories, researchers, and experiments with AI-generated psychology flashcards.',
    keywords: ['psychology flashcards', 'AP Psychology study', 'psychology flashcard generator'],
    sampleTopics: ['Piaget stages', 'Freudian theory', 'Cognitive biases', 'Memory models', 'Disorders'],
    color: 'from-purple-500 to-violet-600',
  },
  {
    slug: 'economics',
    name: 'Economics',
    description: 'Master micro and macroeconomics concepts with AI-generated flashcard games.',
    keywords: ['economics flashcards', 'AP Economics study', 'economics flashcard generator'],
    sampleTopics: ['Supply and demand', 'GDP', 'Monetary policy', 'Game theory', 'Market structures'],
    color: 'from-teal-500 to-cyan-600',
  },
  {
    slug: 'computer-science',
    name: 'Computer Science',
    description: 'Study algorithms, data structures, and systems with CS flashcard games.',
    keywords: ['CS flashcards', 'computer science flashcard generator', 'algorithms study cards'],
    sampleTopics: ['Big O notation', 'Sorting algorithms', 'Graph theory', 'Operating systems', 'Networks'],
    color: 'from-slate-500 to-gray-600',
  },
  {
    slug: 'medicine',
    name: 'Medicine',
    description: 'Medical school flashcards for anatomy, pharmacology, and clinical concepts.',
    keywords: ['medical flashcards', 'USMLE study cards', 'anatomy flashcard generator'],
    sampleTopics: ['Anatomy', 'Pharmacology', 'Pathology', 'Clinical diagnosis', 'Biochemistry'],
    color: 'from-rose-500 to-pink-600',
  },
  {
    slug: 'law',
    name: 'Law',
    description: 'Create bar exam flashcards and legal concept study sets from case notes.',
    keywords: ['law school flashcards', 'bar exam study cards', 'legal flashcard generator'],
    sampleTopics: ['Constitutional law', 'Contracts', 'Torts', 'Criminal law', 'Property'],
    color: 'from-zinc-500 to-neutral-600',
  },
  {
    slug: 'languages',
    name: 'Languages',
    description: 'Build vocabulary and grammar flashcard sets for any language you are learning.',
    keywords: ['language learning flashcards', 'vocabulary flashcard generator', 'foreign language study'],
    sampleTopics: ['Vocabulary', 'Grammar rules', 'Verb conjugation', 'Idioms', 'Pronunciation'],
    color: 'from-sky-500 to-blue-600',
  },
];
