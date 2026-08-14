export type ReviewSentenceMode = 'translation' | 'cloze'

export function reviewSentenceMode(value: unknown): ReviewSentenceMode {
  return value === 'cloze' ? 'cloze' : 'translation'
}

export function isPunctuationToken(word: string): boolean {
  return word.length > 0 && /^[\p{P}\p{S}]+$/u.test(word)
}

export function filterSentenceReviewsByMode<T extends { mode?: unknown }>(
  items: T[],
  mode: ReviewSentenceMode,
): T[] {
  return items.filter(item => reviewSentenceMode(item.mode) === mode)
}

export function reviewResultVisibility(
  mode: ReviewSentenceMode,
  slot: { visible: boolean; punctuation: boolean },
): boolean {
  return mode === 'cloze' ? slot.visible : slot.punctuation
}

export function incorrectItems<T>(items: T[], results: Array<{ correct: boolean }>): T[] {
  return items.filter((_, index) => results[index]?.correct === false)
}
