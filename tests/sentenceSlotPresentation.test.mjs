import assert from 'node:assert/strict'
import test from 'node:test'
import { sentenceHintLabel, sentenceSlotWidth } from '../src/utils/sentenceSlotPresentation.ts'

test('slot width leaves room for text, padding, and bold correct state', () => {
  assert.equal(sentenceSlotWidth('the', ''), 89)
  assert.equal(sentenceSlotWidth('freshly', ''), 149)
  assert.equal(sentenceSlotWidth('deliberately', ''), 224)
  assert.equal(sentenceSlotWidth('the', 'unexpectedly'), 224)
})

test('hint starts with the first letter and reveals one more letter per level', () => {
  assert.equal(sentenceHintLabel('deliberately', 0), '')
  assert.equal(sentenceHintLabel('deliberately', 1), 'd \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7')
  assert.equal(sentenceHintLabel('deliberately', 3), 'd e l \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7 \u00b7')
  assert.equal(sentenceHintLabel('the', 9), 't h e')
})
