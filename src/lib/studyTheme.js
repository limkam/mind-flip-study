/** Study card color themes — persisted in user.preferences.study_theme */

export const STUDY_THEMES = [
  {
    id: 'indigo',
    label: 'Indigo Classic',
    description: 'The default rich indigo & violet palette',
    question: 'from-indigo-600 to-violet-600',
    answer: 'from-emerald-500 to-teal-500',
    questionBorder: 'border-indigo-200 dark:border-indigo-900',
    answerBorder: 'border-emerald-200 dark:border-emerald-900',
    answerBody: 'bg-emerald-50 dark:bg-emerald-950/20',
  },
  {
    id: 'ocean',
    label: 'Ocean Blue',
    description: 'Cool blues and cyans for calm focus',
    question: 'from-blue-600 to-cyan-600',
    answer: 'from-teal-500 to-emerald-400',
    questionBorder: 'border-blue-200 dark:border-blue-900',
    answerBorder: 'border-teal-200 dark:border-teal-900',
    answerBody: 'bg-cyan-50 dark:bg-cyan-950/20',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm oranges and pinks for energy',
    question: 'from-orange-500 to-rose-500',
    answer: 'from-amber-400 to-yellow-400',
    questionBorder: 'border-orange-200 dark:border-orange-900',
    answerBorder: 'border-amber-200 dark:border-amber-900',
    answerBody: 'bg-orange-50 dark:bg-orange-950/20',
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Earthy greens and browns for grounding',
    question: 'from-green-700 to-emerald-600',
    answer: 'from-lime-500 to-green-400',
    questionBorder: 'border-green-200 dark:border-green-900',
    answerBorder: 'border-lime-200 dark:border-lime-900',
    answerBody: 'bg-green-50 dark:bg-green-950/20',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep purples and blues for night study',
    question: 'from-purple-800 to-indigo-800',
    answer: 'from-violet-500 to-purple-500',
    questionBorder: 'border-purple-200 dark:border-purple-900',
    answerBorder: 'border-violet-200 dark:border-violet-900',
    answerBody: 'bg-purple-50 dark:bg-purple-950/20',
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Soft pinks for a gentle learning mood',
    question: 'from-rose-500 to-pink-500',
    answer: 'from-fuchsia-400 to-pink-400',
    questionBorder: 'border-rose-200 dark:border-rose-900',
    answerBorder: 'border-fuchsia-200 dark:border-fuchsia-900',
    answerBody: 'bg-rose-50 dark:bg-rose-950/20',
  },
];

export function getStudyTheme(themeId) {
  return STUDY_THEMES.find((t) => t.id === themeId) || STUDY_THEMES[0];
}

export function studyThemeFromUser(user) {
  return getStudyTheme(user?.preferences?.study_theme || 'indigo');
}
