# Error-book Review Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make error-book spelling, sentence translation, and cloze reviews preserve their mode, share normal sentence hover behavior, and only offer another round when the completed review still contains mistakes.

**Architecture:** Put mode normalization, punctuation detection, mode filtering, and remaining-mistake selection in a small pure utility. `ErrorBook.vue` creates mode-specific review batches, `PracticeEngine.vue` runs and retries only the incorrect items from the just-completed review, and `RoundResult.vue` receives an explicit restart-availability flag.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Node test runner, Vite.

**Spec:** User request in the current Codex task.

## Global Constraints

- Preserve the existing spelling, sentence translation, and cloze routes.
- Do not mix translation and cloze records in one sentence-review round.
- Visible non-punctuation words must use the same hover lookup path as ordinary practice.
- A review result with zero mistakes must not show “再来一轮”.

---

### Task 1: Review policy helpers

**Files:**
- Create: `src/utils/reviewPractice.ts`
- Test: `tests/reviewPractice.test.mjs`

**Interfaces:**
- Produces: `reviewSentenceMode`, `isPunctuationToken`, `filterSentenceReviewsByMode`, `incorrectItems`.

- [ ] Write tests covering cloze mode retention, visible-word punctuation detection, mode filtering, and zero/nonzero mistakes.
- [ ] Run the Node test and confirm it fails before the helper exists.
- [ ] Implement the minimal pure helpers.
- [ ] Run the Node test and confirm it passes.

### Task 2: Mode-specific error-book entry points

**Files:**
- Modify: `src/views/ErrorBook.vue`

**Interfaces:**
- Consumes: review policy helpers from Task 1.
- Produces: review routes with `review=sentence&mode=translation|cloze` and same-mode local batches.

- [ ] Preserve each individual sentence record’s mode in the review route.
- [ ] Replace the mixed sentence batch action with separate translation and cloze actions, shown only when that type exists.
- [ ] Remove review-entry debug logging.

### Task 3: Review engine lifecycle and hover behavior

**Files:**
- Modify: `src/views/PracticeEngine.vue`

**Interfaces:**
- Consumes: review mode, punctuation, and incorrect-item helpers.
- Produces: `canRestart` for the result panel and mode-preserving retry behavior.

- [ ] Resolve review sentence mode from the route query.
- [ ] Rebuild review slots using lexical punctuation detection rather than the historical `visible` flag.
- [ ] Preserve the correct `visible` meaning when submitting cloze review results.
- [ ] Record skipped review sentences and continue through the batch.
- [ ] Restart review rounds with only incorrect items from the completed round.

### Task 4: Conditional result action and verification

**Files:**
- Modify: `src/components/RoundResult.vue`

**Interfaces:**
- Consumes: `canRestart: boolean`.

- [ ] Hide “再来一轮” when the review has no remaining mistakes.
- [ ] Run all utility tests and the production build.
- [ ] Check the final diff for accidental changes and temporary debug artifacts.
