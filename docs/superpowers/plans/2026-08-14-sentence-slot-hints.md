# Sentence Slot Hints Implementation Plan

> **For agentic workers:** Implement inline in this task; no subagent workflow is required.

**Goal:** Prevent long answers from clipping, simplify the correct visual state, and make sentence hints target the currently selected blank.

**Architecture:** Extract deterministic slot sizing and hint rendering into a small TypeScript utility with Node tests. Keep focus selection state in `PracticeEngine.vue`, and let both toolbar and automatic wrong-answer hints update only that slot. CSS owns the stable visual states without changing sentence layout.

**Tech Stack:** Vue 3, TypeScript, Node test runner, scoped CSS

**Spec:** User request and screenshot from 2026-08-14.

## Global Constraints

- Preserve spelling mode behavior.
- Preserve existing sentence submission and scoring behavior.
- Do not overwrite partial user input when revealing a hint.
- Keep the selected hint target stable when the toolbar button receives focus.

---

### Task 1: Deterministic slot presentation helpers

**Files:**
- Create: `src/utils/sentenceSlotPresentation.ts`
- Test: `src/utils/sentenceSlotPresentation.test.ts`

**Interfaces:**
- Produces: `sentenceSlotWidth(word, input)` and `sentenceHintLabel(word, hintLevel)`.

- [ ] Write tests covering short, long, and partially typed words plus progressive hint masking.
- [ ] Run the Node test and confirm it fails before the helper exists.
- [ ] Implement the smallest helper functions that satisfy the cases.
- [ ] Re-run the Node test and confirm it passes.

### Task 2: Focus-targeted hint behavior

**Files:**
- Modify: `src/views/PracticeEngine.vue`

**Interfaces:**
- Consumes: presentation helpers from Task 1.
- Produces: persistent `focusedSlotIndex`, `onSlotFocus`, and target-aware `showHintForSentence`.

- [ ] Record focus for every editable sentence blank.
- [ ] Make the hint button use the selected unfinished blank, falling back to the first unfinished blank only when none has been selected.
- [ ] Focus the hinted blank again and show concise feedback.
- [ ] Keep automatic wrong-answer hints scoped to the attempted blank.

### Task 3: Quiet visual states

**Files:**
- Modify: `src/views/PracticeEngine.vue`

**Interfaces:**
- Consumes: width and hint label values from Tasks 1 and 2.

- [ ] Use the measured width helper for both cloze and translation inputs.
- [ ] Remove the floating check badge and retain a restrained green correct state.
- [ ] Position the hint chip outside normal flow to prevent layout shifts.
- [ ] Strengthen the focused blank state without adding decorative noise.

### Task 4: Verification

**Files:**
- Verify: `src/utils/sentenceSlotPresentation.test.ts`
- Verify: `src/views/PracticeEngine.vue`

- [ ] Run the focused Node test.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check` and inspect the final diff.

