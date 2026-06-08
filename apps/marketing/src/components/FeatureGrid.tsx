'use client';

import { useState } from 'react';

const games = [
  { slug: 'hangman', name: 'Hangman', desc: 'Spell out answers letter by letter under pressure.' },
  { slug: 'memory-match', name: 'Memory Match', desc: 'Flip cards to pair questions with answers.' },
  { slug: 'lightning-round', name: 'Lightning Round', desc: 'Answer as many as you can before the clock runs out.' },
  { slug: 'battle-rpg', name: 'Battle RPG', desc: 'Defeat enemies by answering correctly. Miss and lose HP.' },
  { slug: 'word-scramble', name: 'Word Scramble', desc: 'Drag letters into the right order to spell the answer.' },
  { slug: 'tug-of-war', name: 'Tug of War', desc: 'Answer correctly to pull the rope to your side.' },
  { slug: 'bricks', name: 'Bricks', desc: 'Break bricks by answering — miss and they fall toward you.' },
  { slug: 'quiz-mode', name: 'Quiz Mode', desc: 'Classic 4-option MCQ with a countdown timer.' },
];

function GameCard({ game }: { game: (typeof games)[0] }) {
  const [videoError, setVideoError] = useState(false);

  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:scale-[1.02] hover:shadow-lg">
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-indigo-100 to-violet-100">
        {!videoError ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
            onError={() => setVideoError(true)}
          >
            <source src={`/videos/games/${game.slug}.mp4`} type="video/mp4" />
          </video>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <span className="text-3xl">🎮</span>
            <p className="mt-2 font-semibold text-indigo-700">{game.name}</p>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-bold text-gray-900">{game.name}</h3>
        <p className="mt-1 text-sm text-gray-600">{game.desc}</p>
      </div>
    </article>
  );
}

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-24 px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Eight ways to master your material
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
          Every game uses spaced repetition under the hood.
        </p>
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </div>
    </section>
  );
}
