import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterSentenceReviewsByMode,
  incorrectItems,
  isPunctuationToken,
  reviewResultVisibility,
  reviewSentenceMode,
} from '../src/utils/reviewPractice.ts'

test('review sentence mode preserves cloze and defaults invalid values to translation', () => {
  assert.equal(reviewSentenceMode('cloze'), 'cloze')
  assert.equal(reviewSentenceMode('translation'), 'translation')
  assert.equal(reviewSentenceMode('sentence'), 'translation')
  assert.equal(reviewSentenceMode(undefined), 'translation')
})

test('visible words are not misclassified as punctuation', () => {
  assert.equal(isPunctuationToken('quiet'), false)
  assert.equal(isPunctuationToken(','), true)
  assert.equal(isPunctuationToken('...'), true)
})

test('sentence review batches contain only the requested practice mode', () => {
  const items = [{ id: 1, mode: 'cloze' }, { id: 2, mode: 'translation' }, { id: 3, mode: 'cloze' }]
  assert.deepEqual(filterSentenceReviewsByMode(items, 'cloze').map((item) => item.id), [1, 3])
  assert.deepEqual(filterSentenceReviewsByMode(items, 'translation').map((item) => item.id), [2])
})

test('cloze review submission preserves visible words instead of treating only punctuation as visible', () => {
  assert.equal(reviewResultVisibility('cloze', { visible: true, punctuation: false }), true)
  assert.equal(reviewResultVisibility('cloze', { visible: false, punctuation: false }), false)
  assert.equal(reviewResultVisibility('translation', { visible: true, punctuation: false }), false)
  assert.equal(reviewResultVisibility('translation', { visible: true, punctuation: true }), true)
})

test('another review round contains only items answered incorrectly', () => {
  const items = [{ id: 1 }, { id: 2 }]
  assert.deepEqual(incorrectItems(items, [{ correct: true }, { correct: false }]), [{ id: 2 }])
  assert.deepEqual(incorrectItems(items, [{ correct: true }, { correct: true }]), [])
})
