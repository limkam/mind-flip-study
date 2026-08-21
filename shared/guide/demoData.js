export const demoData = {
  uploadDemo: {
    fileName: "Cognitive_Psychology_Ch4.pdf",
    fileSize: "4.2 MB",
    pages: 24,
    supportedFormats: "PDF, DOCX, PPTX (Up to 10MB)",
  },
  chapterDemo: {
    chapters: [
      { key: "ch1", title: "Chapter 1: Foundations of Memory & Recall", cards: "~14 Cards", defaultSelected: true },
      { key: "ch2", title: "Chapter 2: Spaced Repetition Algorithms", cards: "~18 Cards", defaultSelected: true },
      { key: "ch3", title: "Chapter 3: Advanced Cognitive Load Theory", cards: "~12 Cards", defaultSelected: false },
    ],
  },
  cardRatingDemo: {
    question: "What is active retrieval practice?",
    answer: "Actively recalling information from memory to strengthen neural pathways and maximize long-term retention.",
    ratings: [
      { score: 1, label: "1 Hard", schedule: "Returns sooner (e.g. tomorrow)", qualitative: "Sooner" },
      { score: 2, label: "2", schedule: "Returns soon (e.g. 2 days)", qualitative: "Soon" },
      { score: 3, label: "3 Good", schedule: "Returns moderate (e.g. 4 days)", qualitative: "Moderate" },
      { score: 4, label: "4", schedule: "Returns optimal (e.g. 6 days)", qualitative: "Optimal" },
      { score: 5, label: "5 Easy", schedule: "Returns later (e.g. 10+ days)", qualitative: "Later" },
    ],
  },
  leaderboardDemo: {
    initialRows: [
      { rank: 24, name: "Aminata Diallo", xp: 580, isUser: false },
      { rank: 25, name: "Mohamed Hassan", xp: 550, isUser: false },
      { rank: 26, name: "YOU (Learner)", xp: 520, isUser: true },
    ],
    overtakenRows: [
      { rank: 24, name: "Aminata Diallo", xp: 580, isUser: false },
      { rank: 25, name: "YOU (Learner)", xp: 551, isUser: true, moved: "up" },
      { rank: 26, name: "Mohamed Hassan", xp: 550, isUser: false, moved: "down" },
    ],
    xpNeededToOvertake: 31, // 520 + 31 = 551 > 550
  },
  challengeDemo: {
    opponentEmail: "haja.kabba@bilkeys.io",
    targetTopic: "Cognitive Psychology Ch.4",
    userScore: "9 / 10",
    userTime: "1m 42s",
    opponentScore: "7 / 10",
    opponentTime: "2m 05s",
  },
};
