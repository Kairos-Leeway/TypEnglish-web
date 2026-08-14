const SLOT_HORIZONTAL_SPACE = 44
const SLOT_CHARACTER_WIDTH = 15
const SLOT_MIN_WIDTH = 76

export function sentenceSlotWidth(word: string, input: string): number {
  const characterCount = Math.max(word.length, input.trim().length)
  return Math.max(SLOT_MIN_WIDTH, characterCount * SLOT_CHARACTER_WIDTH + SLOT_HORIZONTAL_SPACE)
}

export function sentenceHintLabel(word: string, hintLevel: number): string {
  if (hintLevel <= 0) return ''
  const revealedCount = Math.min(Math.max(hintLevel, 1), word.length)
  return Array.from(word, (letter, index) => index < revealedCount ? letter : '·').join(' ')
}
