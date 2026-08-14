<script setup lang="ts">
// ============================================================
// PracticeEngine — 统一练习引擎
// mode: spelling | translation | cloze
// review: route query ?review=word → review-spelling
//                     ?review=sentence → review-translation
// ============================================================
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { speak, isTtsLoading } from '../composables/useTts'
import { playCorrectTone, playErrorTone, playKeytap } from '../composables/useChime'
import { useWordLookup } from '../composables/useWordLookup'
import { useXp } from '../composables/useXp'
import { useAuthStore } from '../stores/auth'
import RoundResult from '../components/RoundResult.vue'
import CelebrationFrame from '../components/CelebrationFrame.vue'
import { sentenceHintLabel, sentenceSlotWidth } from '../utils/sentenceSlotPresentation'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { level, progress, gain: gainXp } = useXp()
const { lookup } = useWordLookup()

// ============================================================
// Mode detection
// ============================================================
type PracticeMode = 'spelling' | 'translation' | 'cloze'
const pathToMode: Record<string, PracticeMode> = {
  '/practice': 'spelling',
  '/practice/sentence': 'translation',
  '/practice/cloze': 'cloze',
}
const mode = computed<PracticeMode>(() => {
  // review routes may come via /practice/review with ?review=word or ?review=sentence
  const r = route.query.review as string
  if (r === 'sentence') return 'translation'
  if (r === 'word') return 'spelling'
  return pathToMode[route.path] || 'spelling'
})
const isSentenceMode = computed(() => mode.value === 'translation' || mode.value === 'cloze')
const isReviewWord = computed(() => route.query.review === 'word')
const isReviewSentence = computed(() => route.query.review === 'sentence')

// ============================================================
// Shared state
// ============================================================
const loading = ref(true)
const loadError = ref('')
const finished = ref(false)
const completed = ref(false) // true: 做完所有题; false: 中途结束
const showCelebration = ref(false)
const currentIndex = ref(0)
const language = ref('en')
const requestedCount = computed(() => {
  const value = Number(route.query.count)
  return Number.isFinite(value) ? Math.max(5, Math.min(value, 50)) : 10
})
const MAX_WRONG_BEFORE_HINT = 3

// ============================================================
// Spelling mode state
// ============================================================
const words = ref<any[]>([])
const userInput = ref('')
const attempts = ref(0)
const showHint = ref(false)
const showAnswer = ref(false)
const mustRetype = ref(false)
const shaking = ref(false)
const inputRef = ref<HTMLInputElement>()
const selectedCategory = ref('')
const MAX_ATTEMPTS = 3
const fetchedPhonetic = ref<string | null>(null)
const fetchedExample = ref<string | null>(null)
const results = ref<Array<{ word: any; correct: boolean; answer: string; attempts: number }>>([])
const correctCount = ref(0)

// Spelling: AI补全音标/例句
watch([currentIndex, words], async () => {
  if (isSentenceMode.value) return
  const cur = words.value[currentIndex.value]
  if (!cur) { fetchedPhonetic.value = null; fetchedExample.value = null; return }
  if (cur.phonetic && cur.example) { fetchedPhonetic.value = null; fetchedExample.value = null; return }
  const detail = await lookup('en', cur.word)
  if (!cur.phonetic && detail?.phonetic) { fetchedPhonetic.value = detail.phonetic; cur.phonetic = detail.phonetic }
  if (!cur.example && detail?.example) { fetchedExample.value = detail.example; cur.example = detail.example }
}, { immediate: true })

const feedback = ref('')
const feedbackMsg = ref('')
const feedbackStyle = ref<Record<string, string> | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

function showFeedback(type: 'ok' | 'err' | 'hint', msg?: string) {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedback.value = type; feedbackMsg.value = msg || ''; feedbackStyle.value = null
  requestAnimationFrame(() => {
    feedbackStyle.value = { opacity: '1', transform: 'translateX(-50%) translateY(0)' }
    feedbackTimer = setTimeout(() => {
      feedbackStyle.value = { opacity: '0', transform: 'translateX(-50%) translateY(-6px)' }
      feedbackTimer = setTimeout(() => { feedback.value = ''; feedbackStyle.value = null }, 200)
    }, 800)
  })
}

function hintText() {
  const w = words.value[currentIndex.value]; if (!w) return ''
  const wd = w.word as string
  return wd[0] + '_'.repeat(wd.length - 1) + ` (${wd.length}个字母)`
}

const curWord = computed(() => words.value[currentIndex.value])
const exampleText = computed(() => curWord.value?.example || fetchedExample.value || '')

function renderExampleHtml() {
  const ex = exampleText.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const w = curWord.value?.word
  if (!ex || !w) return `&ldquo;${ex}&rdquo;`
  const input = userInput.value; const len = w.length
  const filled = input.padEnd(len, ' ')
  let html = ''
  for (let i = 0; i < len; i++) {
    const ch = filled[i]
    html += ch !== ' ' ? `<span class="ex-char filled">${ch}</span>` : `<span class="ex-char">_</span>`
  }
  const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return `&ldquo;${ex.replace(regex, () => `<span class="ex-blank">${html}</span>`)}&rdquo;`
}

function isAnswerCorrect(input: string, word: string) { return input.toLowerCase().trim() === word.toLowerCase().trim() }

// ============================================================
// Sentence mode state
// ============================================================
interface WordSlot {
  index: number; word: string; wordId: number | null; punctuation: boolean
  visible: boolean  // cloze: randomly hidden; translation: always false (not visible means it's a blank)
  userInput: string; status: 'pending' | 'correct' | 'retry'
  shaking: boolean; hintLevel: number; wrongCount: number
  translation?: string; phonetic?: string
}
interface WordDetail {
  found: boolean; word: string; phonetic?: string; translation?: string; partOfSpeech?: string; example?: string
}
interface SentenceResult {
  sentenceId?: string | number
  english: string
  chinese: string
  correct: boolean
  slots: Array<{ index: number; word: string; visible: boolean; correct: boolean; answer: string }>
}
const sentences = ref<any[]>([])
const slots = ref<WordSlot[]>([])
const sentenceResults = ref<SentenceResult[]>([])
const reviewData = ref<any[]>([])

const hoveredIdx = ref<number | null>(null)
const hoveredDetail = ref<WordDetail | null>(null)
const focusedSlotIndex = ref<number | null>(null)
const hoverTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hideTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hoverCardStyle = ref<Record<string, string>>({})

async function onWordHover(slot: WordSlot, event: MouseEvent) {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  if (hideTimer.value) { clearTimeout(hideTimer.value); hideTimer.value = null }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const cardWidth = Math.min(280, window.innerWidth - 24)
  const targetCenter = rect.left + rect.width / 2
  const cardCenter = Math.min(
    window.innerWidth - cardWidth / 2 - 12,
    Math.max(cardWidth / 2 + 12, targetCenter),
  )
  hoverCardStyle.value = {
    left: `${cardCenter}px`,
    top: `${rect.top - 10}px`,
    '--arrow-left': `${Math.min(cardWidth - 14, Math.max(14, targetCenter - cardCenter + cardWidth / 2))}px`,
  }
  hoveredIdx.value = slot.index; hoveredDetail.value = null
  hoverTimer.value = setTimeout(async () => {
    const detail = await lookup(language.value, slot.word)
    if (hoveredIdx.value === slot.index) {
      if (detail) hoveredDetail.value = detail
      else { hoveredIdx.value = null; hoveredDetail.value = null }
    }
  }, 100)
}
function onWordLeave() {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  hideTimer.value = setTimeout(() => { hoveredIdx.value = null; hoveredDetail.value = null }, 150)
}

function buildSlots(wordsData: Array<{ index: number; word: string; wordId: number | null; translation?: string; phonetic?: string; punctuation?: boolean }>): WordSlot[] {
  const result: WordSlot[] = wordsData.map((w) => {
    const isPunct = w.punctuation === true
    let visible: boolean
    if (mode.value === 'cloze') {
      visible = isPunct || w.word.length <= 2 || Math.random() > 0.4
    } else {
      visible = isPunct  // translation: only punctuation is visible
    }
    return { index: w.index, word: w.word, wordId: w.wordId, visible, punctuation: isPunct, userInput: '', status: 'pending' as const, shaking: false, hintLevel: 0, wrongCount: 0, translation: w.translation, phonetic: w.phonetic }
  })
  if (mode.value === 'cloze' && result.every(s => s.visible) && result.length > 2) {
    const idx = 1 + Math.floor(Math.random() * (result.length - 2))
    result[idx].visible = false
  }
  return result
}

function initSlots(wordsData: Array<{ index: number; word: string; wordId: number | null }>) {
  slots.value = buildSlots(wordsData)
  focusedSlotIndex.value = null
  nextTick(() => { (document.querySelector('.slot-input') as HTMLInputElement)?.focus() })
}

function onSlotFocus(slot: WordSlot) {
  if (slot.status !== 'correct') focusedSlotIndex.value = slot.index
}

function moveToSlot(fromIdx: number, dir: number) {
  let next = fromIdx + dir
  while (next >= 0 && next < slots.value.length) {
    const s = slots.value[next]
    const isBlank = mode.value === 'cloze' ? !s.visible : !s.punctuation
    if (isBlank && s.status !== 'correct') {
      const el = document.querySelector(`[data-slot="${s.index}"]`) as HTMLInputElement
      el?.focus(); el?.select(); return
    }
    next += dir
  }
}

function buildSentenceSlotsSnapshot(): SentenceResult['slots'] {
  return slots.value.map((s) => ({
    index: s.index,
    word: s.word,
    visible: mode.value === 'cloze' ? s.visible : s.punctuation,
    correct: s.status === 'correct',
    answer: s.userInput || '',
  }))
}

function recordCurrentSentence(correct: boolean) {
  const sent = sentences.value[currentIndex.value]
  if (!sent) return
  const key = `idx-${currentIndex.value}`
  const already = sentenceResults.value.find((r) => r.sentenceId === key)
  if (already) return
  sentenceResults.value.push({
    sentenceId: key,
    english: sent.english,
    chinese: sent.chinese,
    correct,
    slots: buildSentenceSlotsSnapshot(),
  })
}

function validateSlot(slot: WordSlot): boolean {
  if (slot.status === 'correct') return true
  const isBlank = mode.value === 'cloze' ? !slot.visible : !slot.punctuation
  if (!isBlank) return true
  const input = slot.userInput.trim()
  if (!input) return false
  const ok = input.toLowerCase() === slot.word.toLowerCase()
  if (ok) {
    slot.status = 'correct'; correctCount.value++
    playCorrectTone()
    gainXp(10)
    checkAllDone()
    return true
  } else {
    slot.status = 'retry'; slot.shaking = true; slot.wrongCount++
    playErrorTone()
    setTimeout(() => slot.shaking = false, 500)
    if (slot.wrongCount >= MAX_WRONG_BEFORE_HINT) {
      slot.hintLevel = Math.min(slot.hintLevel + 1, slot.word.length); slot.wrongCount = 0
    }
    slot.userInput = ''
    return false
  }
}

function checkAllDone() {
  const blanks = slots.value.filter(s => mode.value === 'cloze' ? !s.visible : !s.punctuation)
  if (blanks.length > 0 && blanks.every(s => s.status === 'correct')) {
    recordCurrentSentence(true)
    submitBatchResults()
    gainXp(30)
    setTimeout(() => nextItem(), 800)
  }
}

function onSlotKeydown(e: KeyboardEvent, slot: WordSlot, idx: number) {
  playKeytap()
  if (e.key === ' ' || e.key === 'Tab' || e.key === 'ArrowRight') { e.preventDefault(); if (mode.value === 'cloze' ? !slot.visible : !slot.punctuation) validateSlot(slot); moveToSlot(idx, 1); return }
  if (e.key === 'ArrowLeft') { e.preventDefault(); if (mode.value === 'cloze' ? !slot.visible : !slot.punctuation) validateSlot(slot); moveToSlot(idx, -1); return }
  if (e.key === 'Enter') { e.preventDefault(); if (mode.value === 'cloze' ? !slot.visible : !slot.punctuation) { const ok = validateSlot(slot); if (ok) moveToSlot(idx, 1) } }
}

function hintLabel(slot: WordSlot): string {
  if (slot.hintLevel === 0 || slot.status === 'correct') return ''
  return sentenceHintLabel(slot.word, slot.hintLevel)
}

// ============================================================
// Loading
// ============================================================
async function loadData() {
  loading.value = true; loadError.value = ''; finished.value = false; completed.value = false; correctCount.value = 0

  if (isSentenceMode.value) {
    // Clear results once when a new round starts. initSlots() also runs between
    // sentences, so clearing there would discard every result except the last.
    sentenceResults.value = []
    // Sentence / Cloze / Review
    try {
      if (isReviewSentence.value) {
        const raw = localStorage.getItem('reviewSentences')
        if (!raw) { finished.value = true; loading.value = false; return }
        reviewData.value = JSON.parse(raw)
        sentences.value = reviewData.value.map((se: any) => ({
          id: se.sentenceId, english: se.english, chinese: se.chinese,
          words: se.slots.map((s: any) => ({ index: s.index, word: s.word, wordId: null, punctuation: s.visible || false, translation: undefined, phonetic: undefined }))
        }))
      } else {
        const { data } = await api.get('/sentences', { params: { count: requestedCount.value } })
        sentences.value = data
      }
      if (sentences.value.length > 0) {
        currentIndex.value = 0
        initSlots(sentences.value[0].words)
      } else {
        loadError.value = '当前题库还没有可用的句子，请返回首页选择其他练习。'
      }
    } catch (e) {
      console.error(e)
      loadError.value = '题目加载失败，请检查后端服务后重试。'
    }
    finally { loading.value = false }
    return
  }

  // Spelling mode
  currentIndex.value = 0; userInput.value = ''; results.value = []; feedback.value = ''; feedbackStyle.value = null
  fetchedPhonetic.value = null; attempts.value = 0; showHint.value = false; showAnswer.value = false
  try {
    if (isReviewWord.value) {
      const stored = localStorage.getItem('reviewWords')
      if (stored) { words.value = JSON.parse(stored); localStorage.removeItem('reviewWords') }
    } else {
      const requestedLanguage = typeof route.query.language === 'string' ? route.query.language : 'en'
      language.value = requestedLanguage
      const { data } = await api.post('/practice/session', { language: requestedLanguage, mode: 'typing', count: requestedCount.value, category: selectedCategory.value || undefined })
      words.value = data.words
    }
    if (words.value.length === 0) {
      loadError.value = '当前语言的词库暂无可用题目，请返回首页选择其他练习。'
    }
    await nextTick(); inputRef.value?.focus()
  } catch (e: any) {
    console.error(e)
    loadError.value = '题目加载失败，请检查后端服务后重试。'
  }
  finally { loading.value = false }
}

// ============================================================
// Submission & Navigation
// ============================================================
function submitBatchResults() {
  if (isReviewSentence.value) {
    const se = reviewData.value[currentIndex.value]
    if (!se) return
    const r = slots.value.map(s => ({ index: s.index, word: s.word, visible: s.punctuation, correct: s.status === 'correct', answer: s.userInput || '' }))
    const hiddenSlots = r.filter(s => !s.visible)
    const c = hiddenSlots.filter(s => s.correct).length
    api.put(`/errorbook/sentences/${se.id}`, { totalSlots: hiddenSlots.length, correctSlots: c, slotResults: r }).catch(() => { })
    return
  }
  const modeLabel = mode.value === 'cloze' ? 'cloze' : 'translation'
  const items = slots.value.filter(s => mode.value === 'cloze' ? !s.visible : !s.punctuation)
    .map(s => ({ wordId: s.wordId, wordText: s.word, correct: s.status === 'correct', answer: s.userInput || '', attempts: s.wrongCount + 1, hintUsed: s.hintLevel > 0, skipped: !s.userInput }))
  if (items.length === 0) return
  api.post('/practice/submit-batch', { mode: modeLabel, language: language.value, items }).catch(() => { })
}

function submitSentenceError() {
  if (!isSentenceMode.value) return
  const sent = sentences.value[currentIndex.value]; if (!sent) return
  const blanks = slots.value.filter(s => mode.value === 'cloze' ? !s.visible : !s.punctuation)
  const total = blanks.length; const correct = blanks.filter(s => s.status === 'correct').length
  if (total === correct || isReviewSentence.value) return
  const sr = slots.value.map(s => ({ index: s.index, word: s.word, visible: s.visible || s.punctuation, correct: s.status === 'correct', answer: s.userInput || '' }))
  api.post('/practice/sentence-error', {
    sentenceId: sent.id || null, english: sent.english, chinese: sent.chinese,
    mode: mode.value, totalSlots: total, correctSlots: correct, slotResults: sr
  }).catch(() => { })
}

function skipSentence() {
  if (isReviewSentence.value) { submitBatchResults(); endSession(true); return }
  recordCurrentSentence(false)
  submitSentenceError()
  if (currentIndex.value >= sentences.value.length - 1) { endSession(true); return }
  nextItem()
}

function nextItem() {
  if (isSentenceMode.value) {
    if (currentIndex.value < sentences.value.length - 1) {
      currentIndex.value++; initSlots(sentences.value[currentIndex.value].words)
    } else { endSession(true) }
  } else {
    feedback.value = ''; feedbackStyle.value = null
    if (currentIndex.value < words.value.length - 1) {
      currentIndex.value++; userInput.value = ''; attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false
      nextTick(() => inputRef.value?.focus())
    } else { endSession(true) }
  }
}

function skipWord() {
  const cur = words.value[currentIndex.value]
  results.value.push({ word: cur, correct: false, answer: '(跳过)', attempts: attempts.value })
  api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: false, answer: '(跳过)', attempts: attempts.value, hintUsed: showHint.value, skipped: true }).catch(() => { })
  if (currentIndex.value >= words.value.length - 1) { endSession(true); return }
  nextItem()
}

async function submitWord() {
  const cur = words.value[currentIndex.value]; const input = userInput.value.trim()
  if (!input) return
  if (mustRetype.value) {
    if (isAnswerCorrect(input, cur.word)) { mustRetype.value = false; showAnswer.value = false; nextItem(); return }
    else { shaking.value = true; setTimeout(() => shaking.value = false, 500); showFeedback('hint', '请正确输入上面的单词'); userInput.value = ''; await nextTick(); inputRef.value?.focus(); return }
  }
  const ok = isAnswerCorrect(input, cur.word)
  if (ok) {
    playCorrectTone(); gainXp(5); showFeedback('ok')
    results.value.push({ word: cur, correct: true, answer: input, attempts: attempts.value + 1 })
    if (attempts.value === 0) correctCount.value++
    await api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: true, answer: input, attempts: attempts.value + 1, hintUsed: showHint.value, skipped: false }).catch(() => { })
    setTimeout(() => nextItem(), 520); return
  }
  attempts.value++; shaking.value = true; playErrorTone(); setTimeout(() => shaking.value = false, 500)
  if (attempts.value >= MAX_ATTEMPTS) {
    showAnswer.value = true; showHint.value = false; mustRetype.value = true
    showFeedback('err', '正确答案已显示')
    results.value.push({ word: cur, correct: false, answer: input, attempts: attempts.value })
    await api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: false, answer: input, attempts: attempts.value, hintUsed: showHint.value, skipped: false }).catch(() => { })
    userInput.value = ''
  } else if (attempts.value >= 2) { showHint.value = true; showFeedback('hint', '再试一次'); userInput.value = '' }
  else { showFeedback('err', '不对，请重试'); userInput.value = '' }
  await nextTick(); inputRef.value?.focus()
}

function showHintForSentence() {
  const isHintable = (slot: WordSlot) => {
    const isBlank = mode.value === 'cloze' ? !slot.visible : !slot.punctuation
    return isBlank && slot.status !== 'correct'
  }
  const focusedSlot = slots.value.find(slot => slot.index === focusedSlotIndex.value)
  const s = focusedSlot && isHintable(focusedSlot) ? focusedSlot : slots.value.find(slot => {
    const isBlank = mode.value === 'cloze' ? !slot.visible : !slot.punctuation
    return isBlank && slot.status !== 'correct'
  })
  if (!s) {
    showFeedback('hint', '没有需要提示的空格')
    return
  }
  focusedSlotIndex.value = s.index
  s.hintLevel = Math.min(s.hintLevel + 1, s.word.length)
  showFeedback('hint', `已提示当前空格的第 ${s.hintLevel} 个字母`)
  nextTick(() => {
    const el = document.querySelector(`[data-slot="${s.index}"]`) as HTMLInputElement
    el?.focus()
  })
}

function slotWidth(slot: WordSlot): string {
  return `${sentenceSlotWidth(slot.word, slot.userInput)}px`
}

function toggleHint() { if (showHint.value || showAnswer.value) return; showHint.value = true }

const wrongWords = ref<any[]>([])
function retryWrong() {
  wrongWords.value = results.value.filter(r => !r.correct).map(r => r.word)
  if (wrongWords.value.length > 0) {
    currentIndex.value = 0; userInput.value = ''; results.value = []; correctCount.value = 0
    attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false
    finished.value = false; completed.value = false
    words.value = wrongWords.value
    nextTick(() => inputRef.value?.focus())
  }
}

function endSession(allDone: boolean) {
  // 不再提交任何未完成的记录——"结束"就是结束，不记录
  finished.value = true
  completed.value = allDone
  if (allDone) showCelebration.value = true
}

// "结束" button: go directly home — 不记录，直接走人
function endNow() {
  router.push('/')
}

function restart() {
  showCelebration.value = false
  finished.value = false; completed.value = false; currentIndex.value = 0; correctCount.value = 0
  if (isSentenceMode.value) { sentences.value = []; slots.value = []; sentenceResults.value = [] }
  else { words.value = []; userInput.value = ''; results.value = []; attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false }
  loadData()
}

function goHome() {
  if (isReviewSentence.value) router.push('/errorbook')
  else router.push('/')
}

function onReviewWrong() {
  retryWrong()
}

// Delete word (spelling only)
const deleteConfirmVisible = ref(false)
const deleteTargetWord = ref('')
const deleteTargetType = ref<'word' | 'sentence'>('word')
function confirmDeleteWord() { deleteTargetWord.value = words.value[currentIndex.value]?.word || ''; deleteTargetType.value = 'word'; deleteConfirmVisible.value = true }
function confirmDeleteSentence() { deleteTargetWord.value = sentences.value[currentIndex.value]?.id ? '(句子ID:' + sentences.value[currentIndex.value].id + ')' : ''; deleteTargetType.value = 'sentence'; deleteConfirmVisible.value = true }
async function doDeleteWord() {
  const cur = words.value[currentIndex.value]; deleteConfirmVisible.value = false
  if (!cur || !cur.id) return
  await api.delete(`/words/${cur.id}`).catch(() => { })
  words.value.splice(currentIndex.value, 1)
  if (words.value.length === 0) { endSession(true) }
  else if (currentIndex.value >= words.value.length) currentIndex.value--
  attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false
  userInput.value = ''; feedback.value = ''
  nextTick(() => inputRef.value?.focus())
}
async function doDeleteSentence() {
  const cur = sentences.value[currentIndex.value]; deleteConfirmVisible.value = false
  if (!cur || !cur.id) return
  await api.delete(`/sentences/${cur.id}`).catch(() => { })
  sentences.value.splice(currentIndex.value, 1)
  if (sentences.value.length === 0) { endSession(true); return }
  if (currentIndex.value >= sentences.value.length) currentIndex.value--
  initSlots(sentences.value[currentIndex.value].words)
}

// Global keyboard
function onGlobalKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod && e.key !== 'Escape') return
  if (e.key === 'Escape') { e.preventDefault(); endNow() }
  if (isSentenceMode.value) {
    if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); speak(sentences.value[currentIndex.value]?.english) }
    if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); showHintForSentence() }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); skipSentence() }
  } else {
    if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); speak(words.value[currentIndex.value]?.word) }
    if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); toggleHint() }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); skipWord() }
  }
}

// Init
onMounted(() => {
  if (route.query.category) selectedCategory.value = route.query.category as string
  loadData()
  document.addEventListener('keydown', onGlobalKeydown)
})
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))

// Computed for result panel
const pageTitle = computed(() => {
  if (isReviewWord.value) return 'TypEnglish · 错题复习'
  if (isReviewSentence.value) return 'TypEnglish · 错题复习'
  if (mode.value === 'spelling') return 'TypEnglish · 拼写练习'
  if (mode.value === 'cloze') return 'TypEnglish · 完形填空'
  return 'TypEnglish · 句子翻译'
})
const practiceName = computed(() => pageTitle.value.replace('TypEnglish · ', ''))
</script>

<template>
  <div class="practice-engine">
    <CelebrationFrame v-show="showCelebration" v-model="showCelebration" :correct-count="correctCount" />

    <!-- ========== TOPBAR ========== -->
    <header class="topbar">
      <div class="nav-island context-island">
        <router-link to="/" class="nav-back" aria-label="返回首页" title="返回首页">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </router-link>
        <span class="nav-divider" aria-hidden="true" />
        <span class="brand-signal" aria-hidden="true"><i /><i /><i /></span>
        <span class="nav-context">
          <span class="nav-eyebrow">FOCUS SESSION</span>
          <strong class="page-title">{{ practiceName }}</strong>
        </span>
      </div>

      <div class="nav-island status-island">
        <span class="level-orb">{{ level }}</span>
        <span class="xp-context">
          <span class="xp-copy"><strong>Lv.{{ level }}</strong><small>{{ progress }}%</small></span>
          <span class="xp-track" aria-label="本级学习进度"><i :style="{ width: progress + '%' }" /></span>
        </span>
        <button class="logout-btn" @click="auth.logout(); router.push('/login')" aria-label="退出登录" title="退出登录">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>
        </button>
      </div>
    </header>

    <!-- ========== LOADING ========== -->
    <div v-if="loading" class="center-state">
      <div class="loader" /><p>{{ isSentenceMode ? '加载句子中...' : '准备题目中...' }}</p>
    </div>

    <div v-else-if="loadError" class="load-error-state" role="alert">
      <div class="load-error-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8v5m0 3.5v.5"/><path d="M16 3h5v5"/><path d="m21 3-6 6"/></svg>
      </div>
      <div class="load-error-copy"><strong>这一轮还没准备好</strong><p>{{ loadError }}</p></div>
      <div class="load-error-actions">
        <button class="retry-load" @click="loadData">重新加载</button>
        <button class="back-home" @click="router.push('/')">返回首页</button>
      </div>
    </div>

    <!-- ========== RESULT PANEL ========== -->
    <RoundResult
      v-else-if="finished"
      :mode="mode"
      :completed="completed"
      :is-review-sentence="isReviewSentence"
      :words="words"
      :results="results"
      :sentences="sentences"
      :sentence-results="sentenceResults"
      :correct-count="correctCount"
      @home="goHome"
      @restart="restart"
      @review-wrong="onReviewWrong"
    />

    <!-- ========== SPELLING MID-ZONE ========== -->
    <template v-else-if="!isSentenceMode && words.length > 0">
      <div class="main-content">
        <div class="top-zone">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: (currentIndex / words.length * 100) + '%' }" /></div>
          <div class="progress-row">
            <span class="counter">{{ currentIndex + 1 }}/{{ words.length }}</span>
            <div class="progress-actions">
              <button class="tool-btn hint" @click="toggleHint" :disabled="showHint || showAnswer" title="显示提示 (Ctrl+I)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/></svg>
                <span>提示</span>
              </button>
              <button class="tool-btn speak" @click="speak(words[currentIndex]?.word)" :disabled="isTtsLoading" :aria-busy="isTtsLoading" title="听发音">
                <span v-if="isTtsLoading" class="tts-spinner" />
                <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                <span>{{ isTtsLoading ? '准备语音...' : '朗读' }}</span>
              </button>
              <button class="tool-btn skip" @click="skipWord" title="跳过 (Ctrl+S)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 7 12 1 20"/><polyline points="23 4 17 12 23 20"/></svg>
                <span>跳过</span>
              </button>
              <button v-if="words[currentIndex]" class="tool-btn delete" @click="confirmDeleteWord" title="删除此题">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>删除</span>
              </button>
              <button class="tool-btn end" @click="endNow" title="结束练习">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                <span>结束</span>
              </button>
            </div>
          </div>
        </div>
        <div class="mid-zone">
          <div v-if="exampleText" class="example-banner">
            <div v-if="showAnswer" class="example-full">&ldquo;{{ exampleText }}&rdquo;</div>
            <div v-else class="example-masked" v-html="renderExampleHtml()" />
          </div>
          <div class="card-body">
            <p class="chinese-word">{{ words[currentIndex].translation }}</p>
            <p v-if="words[currentIndex].phonetic || fetchedPhonetic" class="phonetic-text">/{{ words[currentIndex].phonetic || fetchedPhonetic }}/</p>
            <p v-if="words[currentIndex].partOfSpeech" class="pos-tag">{{ words[currentIndex].partOfSpeech }}</p>
            <p v-if="showHint" class="hint-text">{{ hintText() }}</p>
            <p v-if="showAnswer" class="reveal-answer">{{ words[currentIndex].word }}</p>
          </div>
          <div :class="['input-row', { 'answer-correct-fx': feedback === 'ok', 'answer-error-fx': shaking }]">
            <span class="answer-fx-ring" aria-hidden="true" />
            <span class="answer-fx-spark spark-one" aria-hidden="true" />
            <span class="answer-fx-spark spark-two" aria-hidden="true" />
            <span class="answer-fx-spark spark-three" aria-hidden="true" />
            <input ref="inputRef" v-model="userInput" class="answer-input" :class="{ wrong: shaking, revealed: showAnswer }" placeholder="输入单词..." autocomplete="off" spellcheck="false" @keyup.enter="submitWord()" @keydown="playKeytap()" />
            <button class="speak-btn" @click="speak(words[currentIndex].word)" :disabled="showAnswer || isTtsLoading" :aria-busy="isTtsLoading" title="听发音">
              <span v-if="isTtsLoading" class="tts-spinner" />
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
            </button>
          </div>
          <span v-if="attempts > 0 && !mustRetype" class="attempts-badge">{{ attempts }}/{{ MAX_ATTEMPTS }} 次尝试</span>
          <div class="feedback-toast" :class="{ 'fb-ok': feedback === 'ok', 'fb-err': feedback === 'err', 'fb-hint': feedback === 'hint', 'fb-show': !!feedbackStyle }" :style="feedbackStyle">
            <div class="fb-inner" v-if="feedback === 'ok'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              <span>正确</span>
            </div>
            <div class="fb-inner" v-else-if="feedback === 'err'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              <span>{{ feedbackMsg }}</span>
            </div>
            <div class="fb-inner" v-else-if="feedback === 'hint'">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>{{ feedbackMsg }}</span>
            </div>
          </div>
        </div>
        <div class="bottom-zone">
          <div class="si-items" aria-label="键盘快捷操作">
            <span class="si-item"><span class="key-sequence"><kbd>↵</kbd></span><span class="si-action">确认</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>H</kbd></span><span class="si-action">朗读</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>I</kbd></span><span class="si-action">提示</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>S</kbd></span><span class="si-action">跳过</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-wide">esc</kbd></span><span class="si-action">返回</span></span>
          </div>
        </div>
      </div>
    </template>

    <!-- ========== SENTENCE MID-ZONE ========== -->
    <template v-else-if="isSentenceMode && sentences.length > 0">
      <div class="card">
        <div class="top-zone">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: (currentIndex / sentences.length * 100) + '%' }" /></div>
          <div class="card-top-row">
            <span class="counter">{{ currentIndex + 1 }}/{{ sentences.length }}</span>
            <div class="top-actions">
              <button class="tool-btn hint" @click="showHintForSentence" title="提示当前选中的空格 (Ctrl+I)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/></svg>
                <span>提示</span>
              </button>
              <button class="tool-btn speak" @click="speak(sentences[currentIndex].english)" :disabled="isTtsLoading" :aria-busy="isTtsLoading" title="听发音">
                <span v-if="isTtsLoading" class="tts-spinner" />
                <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                <span>{{ isTtsLoading ? '准备语音...' : '朗读' }}</span>
              </button>
              <button class="tool-btn skip" @click="skipSentence" title="跳过 (Ctrl+S)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 7 12 1 20"/><polyline points="23 4 17 12 23 20"/></svg>
                <span>跳过</span>
              </button>
              <button v-if="sentences[currentIndex]?.id" class="tool-btn delete" @click="confirmDeleteSentence" title="删除此题">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>删除</span>
              </button>
              <button class="tool-btn end" @click="endNow" title="结束练习">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                <span>结束</span>
              </button>
            </div>
          </div>
        </div>
        <div class="mid-zone">
          <div class="chinese-area"><p class="chinese-text">{{ sentences[currentIndex].chinese }}</p></div>
          <div :class="mode === 'cloze' ? 'slots-line' : 'slots-area'">
            <template v-for="(s, i) in slots" :key="i">
              <!-- Punctuation -->
              <span v-if="s.punctuation" class="punct-mark">{{ s.word }}</span>
              <!-- Hidden blank (cloze) -->
              <span v-else-if="mode === 'cloze' && !s.visible" :class="['slot-wrapper', s.status, { shaking: s.shaking }]" @mouseenter="s.status === 'correct' ? onWordHover(s, $event) : null" @mouseleave="s.status === 'correct' ? onWordLeave() : null">
                <div v-if="hintLabel(s)" class="hint-above">{{ hintLabel(s) }}</div>
                <input :data-slot="s.index" v-model="s.userInput" :class="['slot-input', s.status, { shaking: s.shaking }]" :disabled="s.status === 'correct'" :style="{ width: slotWidth(s) }" spellcheck="false" autocomplete="off" @focus="onSlotFocus(s)" @keydown="onSlotKeydown($event, s, i)" />
                <div v-if="hoveredIdx === s.index && s.status === 'correct'" class="hover-word-card" :class="{ loaded: hoveredDetail }" :style="hoverCardStyle">
                  <div class="hw-top"><span class="hw-word">{{ s.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
                  <div v-if="hoveredDetail?.phonetic" class="hw-phonetic">/{{ hoveredDetail.phonetic }}/</div>
                  <div v-if="!hoveredDetail" class="hw-loading">查询中...</div>
                  <div v-if="hoveredDetail?.translation" class="hw-trans">{{ hoveredDetail.translation }}</div>
                </div>
              </span>
              <!-- Visible word (cloze) -->
              <span v-else-if="mode === 'cloze' && s.visible" class="vis-word" @mouseenter="onWordHover(s, $event)" @mouseleave="onWordLeave">
                {{ s.word }}
                <div v-if="hoveredIdx === s.index" class="hover-word-card" :class="{ loaded: hoveredDetail }" :style="hoverCardStyle">
                  <div class="hw-top"><span class="hw-word">{{ s.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
                  <div v-if="hoveredDetail?.phonetic" class="hw-phonetic">/{{ hoveredDetail.phonetic }}/</div>
                  <div v-if="!hoveredDetail" class="hw-loading">查询中...</div>
                  <div v-if="hoveredDetail?.translation" class="hw-trans">{{ hoveredDetail.translation }}</div>
                </div>
              </span>
              <!-- Translation mode: all non-punctuation are blanks -->
              <div v-else :class="['slot-item', s.status, { shaking: s.shaking }]" @mouseenter="s.status === 'correct' ? onWordHover(s, $event) : null" @mouseleave="s.status === 'correct' ? onWordLeave() : null">
                <div v-if="hintLabel(s)" class="hint-above">{{ hintLabel(s) }}</div>
                <input :data-slot="s.index" v-model="s.userInput" class="slot-input" :class="s.status" :disabled="s.status === 'correct'" :style="{ width: slotWidth(s) }" spellcheck="false" autocomplete="off" @focus="onSlotFocus(s)" @keydown="onSlotKeydown($event, s, i)" />
                <div v-if="hoveredIdx === s.index && s.status === 'correct'" class="hover-word-card" :class="{ loaded: hoveredDetail }" :style="hoverCardStyle">
                  <div class="hw-top"><span class="hw-word">{{ s.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
                  <div v-if="hoveredDetail?.phonetic" class="hw-phonetic">/{{ hoveredDetail.phonetic }}/</div>
                  <div v-if="!hoveredDetail" class="hw-loading">查询中...</div>
                  <div v-if="hoveredDetail?.translation" class="hw-trans">{{ hoveredDetail.translation }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>
        <div class="bottom-zone">
          <div class="si-items" aria-label="键盘快捷操作">
            <span class="si-item"><span class="key-sequence"><kbd class="key-wide">Tab</kbd></span><span class="si-action">切换空位</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>H</kbd></span><span class="si-action">朗读</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>I</kbd></span><span class="si-action">提示</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-mod">Ctrl</kbd><kbd>S</kbd></span><span class="si-action">跳过</span></span>
            <span class="si-item"><span class="key-sequence"><kbd class="key-wide">esc</kbd></span><span class="si-action">返回</span></span>
          </div>
        </div>
      </div>
    </template>

    <!-- Delete confirm overlay -->
    <div v-if="deleteConfirmVisible" class="modal-overlay" @click.self="deleteConfirmVisible = false">
      <div class="modal-card" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 class="modal-title">{{ deleteTargetType === 'word' ? '删除单词？' : '删除句子？' }}</h3>
        <p class="modal-body">
          此操作<span style="color:#ff3b30;font-weight:600">不可撤销</span>。
          <template v-if="deleteTargetType === 'word'">
            将从题库和错题本中删除此题。
          </template>
          <template v-else>
            将删除该句子及其错题记录。
          </template>
        </p>
        <div class="modal-actions" style="margin-top:8px">
          <button class="modal-btn cancel" @click="deleteConfirmVisible = false">取消</button>
          <button class="modal-btn confirm" @click="deleteTargetType === 'word' ? doDeleteWord() : doDeleteSentence()">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ====== 全局 ====== */
.practice-engine { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: transparent }

/* ====== 悬浮导航岛 ====== */
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 66px; padding: 14px 18px 4px; flex-shrink: 0; z-index: 10; pointer-events: none }
.nav-island { display: flex; align-items: center; pointer-events: auto; box-sizing: border-box; min-height: 48px; border: 1px solid rgba(255,255,255,.76); border-radius: 17px; background: rgba(255,255,255,.62); box-shadow: 0 9px 28px rgba(44,32,25,.065), inset 0 1px 0 rgba(255,255,255,.92); backdrop-filter: blur(24px) saturate(1.35); -webkit-backdrop-filter: blur(24px) saturate(1.35) }
.context-island { gap: 10px; padding: 5px 15px 5px 6px }
.nav-back { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; color: #6e6e73; background: rgba(255,255,255,.74); box-shadow: 0 1px 5px rgba(0,0,0,.06); transition: transform .18s ease, color .18s ease, background .18s ease }
.nav-back:hover { color: #ff6b42; background: #fff; transform: translateX(-2px) }
.nav-divider { width: 1px; height: 22px; background: rgba(0,0,0,.075) }
.brand-signal { display: flex; align-items: center; justify-content: center; gap: 2px; width: 20px; height: 26px; color: #ff7048 }
.brand-signal i { display: block; width: 3px; border-radius: 999px; background: currentColor; animation: signalBreathe 1.8s ease-in-out infinite }
.brand-signal i:nth-child(1) { height: 8px; animation-delay: -.25s }
.brand-signal i:nth-child(2) { height: 17px }
.brand-signal i:nth-child(3) { height: 11px; animation-delay: -.55s }
@keyframes signalBreathe { 0%,100% { transform: scaleY(.72); opacity: .62 } 50% { transform: scaleY(1); opacity: 1 } }
.nav-context { display: flex; flex-direction: column; justify-content: center; gap: 1px; min-width: 102px }
.nav-eyebrow { color: #aaa6a3; font-size: 8px; font-weight: 750; letter-spacing: 1.35px; line-height: 1.2 }
.page-title { color: #292624; font-size: 14px; font-weight: 680; line-height: 1.3; white-space: nowrap }
.status-island { gap: 9px; padding: 5px 6px 5px 7px }
.level-orb { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; color: #fff; background: linear-gradient(145deg, #ff8b64, #ff6641); box-shadow: 0 5px 13px rgba(255,105,67,.24); font-size: 12px; font-weight: 760 }
.xp-context { display: flex; flex-direction: column; gap: 5px; width: 82px }
.xp-copy { display: flex; align-items: baseline; justify-content: space-between; line-height: 1 }
.xp-copy strong { color: #4b4744; font-size: 11px; font-weight: 700 }
.xp-copy small { color: #aaa6a3; font-size: 9px; font-weight: 600 }
.xp-track { position: relative; height: 4px; overflow: hidden; border-radius: 99px; background: rgba(0,0,0,.07) }
.xp-track i { position: absolute; inset: 0 auto 0 0; max-width: 100%; border-radius: inherit; background: linear-gradient(90deg, #54cf78, #8cdc77); box-shadow: 0 0 8px rgba(68,195,105,.35); transition: width .35s ease }
.logout-btn { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 11px; background: transparent; color: #aaa6a3; cursor: pointer; transition: color .18s ease, background .18s ease; font-family: inherit }
.logout-btn:hover { color: #ff453a; background: rgba(255,69,58,.08) }

/* ====== 加载 ====== */
.center-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #86868b; gap: 16px }
.loader { width: 28px; height: 28px; border: 2px solid rgba(0, 0, 0, .18); border-top-color: #ff7a50; border-radius: 50%; animation: spin .7s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }
.load-error-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 20px;color:#2d2928}
.load-error-icon{display:grid;place-items:center;width:64px;height:64px;margin-bottom:18px;border:1px solid rgba(255,122,80,.18);border-radius:20px;color:#ff7048;background:rgba(255,255,255,.68);box-shadow:0 14px 38px rgba(232,115,74,.1),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(18px)}
.load-error-copy strong{font-size:20px;font-weight:720}.load-error-copy p{max-width:440px;margin:8px auto 0;color:#86868b;font-size:14px;line-height:1.7}
.load-error-actions{display:flex;gap:10px;margin-top:22px}.load-error-actions button{height:40px;padding:0 18px;border-radius:12px;font:600 13px inherit;cursor:pointer;transition:.18s}
.retry-load{border:0;color:#fff;background:linear-gradient(135deg,#ff7a50,#ff9872);box-shadow:0 7px 18px rgba(255,112,72,.22)}.retry-load:hover{transform:translateY(-1px)}
.back-home{border:1px solid rgba(0,0,0,.08);color:#6e6e73;background:rgba(255,255,255,.7)}.back-home:hover{color:#2d2928;background:#fff}

/* ====== 结果面板 ====== */
.result-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 48px 24px }
.result-icon-wrap { width: 60px; height: 60px; background: #fef3ee; border-radius: 14px; display: flex; align-items: center; justify-content: center }
.result-panel h2 { font-size: 26px; font-weight: 700; color: #1d1d1f; margin: 0 }
.result-meta { font-size: 17px; color: #86868b; margin: 0 }
.result-big-num { font-size: 72px; font-weight: 800; color: #ff7a50; line-height: 1 }
.result-words { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 560px }
.rw-chip { padding: 8px 18px; border-radius: 10px; font-size: 17px; font-weight: 500 }
.rw-ok { background: #f2fff4; color: #34c759 }
.rw-err { background: #fff0ef; color: #ff3b30 }
.result-actions { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content: center }
.countdown-hint { font-size: 15px; color: #ff7a50; font-weight: 600; animation: pulse 1s ease-in-out infinite }
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
.retry-btn { margin-top: 8px; padding: 13px 44px; background: #ff7a50; color: #fff; border: none; border-radius: 12px; font-size: 18px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: inherit }
.retry-btn:hover { background: #ff5722; transform: translateY(-1px) }
.retry-btn.secondary { padding: 13px 36px; background: #34c759; font-size: 16px }
.retry-btn.secondary:hover { background: #2ea043 }
.retry-btn.outline { padding: 13px 36px; background: #fff; color: #ff9500; border: 2px solid rgba(232, 164, 74, .35); font-size: 16px }
.retry-btn.outline:hover { background: #fef9f0; border-color: #ff7a50; transform: translateY(-1px) }

/* ====== 主体内容区 ====== */
.main-content, .card { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 32px 28px 28px; max-width: 960px; margin: 0 auto; width: 100% }

/* —— 顶部 —— */
.top-zone { flex-shrink: 0; padding-top: 20px; max-width: 720px; width: 100%; margin: 0 auto }
.progress-bar { width: 100%; height: 3px; background: rgba(0, 0, 0, .15); border-radius: 2px; overflow: hidden }
.progress-fill { height: 100%; background: #ff7a50; border-radius: 2px; transition: width .4s ease }
.progress-row, .card-top-row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px }
.counter { font-size: 16px; color: #86868b; font-weight: 500 }
.attempts-badge { font-size: 13px; color: #ff3b30; font-weight: 600; text-align: center; margin-top: 10px }
.progress-actions, .top-actions { display: flex; gap: 6px; align-items: center }

/* ── 工具栏按钮 ── */
.tool-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: all .2s ease;
  border: 1px solid rgba(0, 0, 0, .15);
  color: #6e6e73;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
  user-select: none;
}
.tool-btn svg { flex-shrink: 0; transition: transform .2s ease }
.tool-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, .18);
  border-color: rgba(0, 0, 0, .28);
}
.tool-btn:active { transform: translateY(0) scale(.97); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); transition: transform .06s ease }
.tool-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: 0 1px 2px rgba(0, 0, 0, .08) }

.tool-btn.hint { background: linear-gradient(180deg, #f5f5ff 0%, #f0efff 100%); color: #5856d6 }
.tool-btn.hint:hover { color: #4340b8; border-color: rgba(124,111,186,.3); box-shadow: 0 4px 14px rgba(124,111,186,.12) }
.tool-btn.hint:hover svg { transform: rotate(-12deg) }

.tool-btn.speak { background: linear-gradient(180deg, #fefaf7 0%, #fdf3eb 100%); color: #ff7a50 }
.tool-btn.speak:hover { color: #ff5722; border-color: rgba(196,148,106,.3); box-shadow: 0 4px 14px rgba(196,148,106,.12) }
.tool-btn.speak:hover svg { transform: scale(1.15) }

.tool-btn.skip { background: linear-gradient(180deg, #f9fcfa 0%, #eff7f2 100%); color: #34c759 }
.tool-btn.skip:hover { color: #248a3d; border-color: rgba(124,174,140,.3); box-shadow: 0 4px 14px rgba(124,174,140,.12) }
.tool-btn.skip:hover svg { transform: translateX(2px) }

.tool-btn.delete { background: linear-gradient(180deg, #fefafa 0%, #fdf2f2 100%); color: #ff3b30 }
.tool-btn.delete:hover { color: #d6281e; border-color: rgba(196,122,122,.3); box-shadow: 0 4px 14px rgba(196,122,122,.12) }
.tool-btn.delete:hover svg { transform: rotate(90deg) }

.tool-btn.end {
  color: #ff5722; border-color: rgba(232,115,74,.15);
  background: linear-gradient(180deg, #fef9f4 0%, #fef3ee 100%);
  box-shadow: 0 1px 3px rgba(232,115,74,.08);
}
.tool-btn.end:hover {
  color: #d6281e; border-color: rgba(232,115,74,.35);
  box-shadow: 0 4px 16px rgba(232,115,74,.2);
}
.tool-btn.end:hover svg { transform: rotate(90deg) scale(1.1) }

/* —— 中间 —— */
.mid-zone { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; gap: 0 }

/* Spelling specific */
.example-banner { max-width: 560px; text-align: center; margin: 0 auto 48px }
.example-full { font-size: 17px; color: #1d1d1f; line-height: 1.6; font-style: italic }
.example-masked { font-size: 17px; color: #1d1d1f; line-height: 1.6; font-style: italic }
.example-masked :deep(.ex-blank) { display: inline-flex; gap: 3px; background: rgba(232, 115, 74, .08); border-bottom: 2px solid #ff7a50; padding: 0 6px; margin: 0 2px; border-radius: 3px 3px 0 0 }
.example-masked :deep(.ex-char) { display: inline-block; width: 14px; text-align: center; font-style: normal; font-weight: 600; font-size: 16px; color: #1d1d1f }
.example-masked :deep(.ex-char:not(.filled)) { color: #c7c7cc }
.card-body { text-align: center; max-width: 560px }
.chinese-word { font-size: 44px; font-weight: 700; color: #1d1d1f; margin: 0; line-height: 1.3; word-break: break-word }
.phonetic-text { font-size: 18px; color: #ff7a50; margin: 10px 0 0; font-family: Georgia, serif }
.pos-tag { font-size: 16px; color: #86868b; margin: 6px 0 0; font-style: italic }
.hint-text { margin-top: 14px; font-size: 18px; color: #ff7a50; background: #fef3ee; display: inline-block; padding: 6px 18px; border-radius: 8px; font-family: 'SF Mono', monospace; letter-spacing: 2px }
.reveal-answer { margin-top: 14px; font-size: 22px; color: #ff3b30; font-weight: 700; background: #fff0ef; display: inline-block; padding: 6px 18px; border-radius: 8px }
.input-row { position: relative; display: flex; align-items: flex-end; justify-content: center; gap: 0; margin-top: 36px; isolation: isolate }
.answer-input { width: 100%; max-width: 480px; padding: 12px 0; border: none; border-bottom: 2.5px solid rgba(0, 0, 0, .25); font-size: 28px; outline: 0; text-align: center; font-family: inherit; background: transparent; transition: border-color .2s; border-radius: 0; letter-spacing: 1px; box-sizing: border-box; color: #1d1d1f }
.answer-input::placeholder { color: rgba(0, 0, 0, .25) }
.answer-input:focus { border-bottom-color: #ff7a50 }
.answer-input.revealed { border-bottom-color: #ffaea9; color: #ff3b30 }
.answer-fx-ring { position: absolute; left: 50%; bottom: 0; width: min(500px, 88%); height: 48px; border-radius: 50%; border: 1.5px solid transparent; transform: translateX(-50%) scale(.82); pointer-events: none; z-index: -1; opacity: 0 }
.answer-fx-spark { position: absolute; left: 50%; bottom: 14px; width: 5px; height: 5px; border-radius: 50%; background: #34c759; box-shadow: 0 0 12px rgba(52,199,89,.55); pointer-events: none; opacity: 0 }
.answer-correct-fx .answer-input { color: #248a3d; border-bottom-color: #34c759; animation: answerSettle .5s cubic-bezier(.2,1.45,.35,1) both }
.answer-correct-fx .answer-fx-ring { border-color: rgba(52,199,89,.42); background: radial-gradient(ellipse, rgba(52,199,89,.1), transparent 68%); animation: answerRing .62s ease-out both }
.answer-correct-fx .answer-fx-spark { animation: answerSpark .58s cubic-bezier(.2,.8,.3,1) both }
.answer-correct-fx .spark-one { --spark-x: -76px; --spark-y: -42px; animation-delay: .02s }
.answer-correct-fx .spark-two { --spark-x: 0px; --spark-y: -57px; animation-delay: .07s }
.answer-correct-fx .spark-three { --spark-x: 78px; --spark-y: -38px; animation-delay: .11s }
.answer-error-fx .answer-input { border-bottom-color: #ff453a; animation: answerReject .42s cubic-bezier(.36,.07,.19,.97) both }
.answer-error-fx .answer-fx-ring { border-color: rgba(255,69,58,.36); background: radial-gradient(ellipse, rgba(255,69,58,.08), transparent 68%); animation: errorRing .44s ease-out both }
@keyframes answerSettle { 0% { transform: translateY(0) scale(1) } 38% { transform: translateY(-5px) scale(1.018) } 100% { transform: translateY(0) scale(1) } }
@keyframes answerRing { 0% { opacity: 0; transform: translateX(-50%) scale(.72) } 35% { opacity: 1 } 100% { opacity: 0; transform: translateX(-50%) scale(1.08) } }
@keyframes answerSpark { 0% { opacity: 0; transform: translate(0,0) scale(.25) } 25% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--spark-x), var(--spark-y)) scale(.6) } }
@keyframes answerReject { 0%,100% { transform: translateX(0) } 18% { transform: translateX(-7px) } 36% { transform: translateX(6px) } 54% { transform: translateX(-4px) } 72% { transform: translateX(3px) } }
@keyframes errorRing { 0% { opacity: 0; transform: translateX(-50%) scale(.8) } 35% { opacity: .9 } 100% { opacity: 0; transform: translateX(-50%) scale(1.04) } }
.speak-btn { width: 40px; height: 40px; border: none; border-radius: 10px; background: rgba(0, 0, 0, .06); color: #86868b; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all .15s; margin-left: 8px }
.speak-btn:hover { background: rgba(0, 0, 0, .18); color: #1d1d1f }
.feedback-toast { position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%) translateY(8px) scale(.92); z-index: 200; opacity: 0; transition: opacity .2s ease, transform .35s cubic-bezier(.2,1.25,.3,1); pointer-events: none }
.feedback-toast.fb-show { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) }
.fb-inner { display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 9px 20px; border-radius: 24px; font-size: 15px; font-weight: 650; letter-spacing: -.1px; backdrop-filter: blur(22px) saturate(1.25); -webkit-backdrop-filter: blur(22px) saturate(1.25); white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,.1), inset 0 1px 0 rgba(255,255,255,.7) }
.fb-ok .fb-inner { background: rgba(241,255,245,.88); color: #248a3d; border: 1px solid rgba(52,199,89,.24); box-shadow: 0 12px 34px rgba(36,138,61,.14), inset 0 1px 0 rgba(255,255,255,.9) }
.fb-ok .fb-inner svg { animation: feedbackCheck .48s cubic-bezier(.2,1.5,.3,1) both }
.fb-err .fb-inner { background: rgba(255,247,246,.9); color: #d12f27; border: 1px solid rgba(255,69,58,.2); box-shadow: 0 12px 34px rgba(209,47,39,.11), inset 0 1px 0 rgba(255,255,255,.9) }
.fb-err .fb-inner svg { animation: feedbackError .4s ease-out both }
.fb-hint .fb-inner { background: rgba(232, 164, 74, .1); color: #ff9500; border: 1px solid rgba(232, 164, 74, .2) }
@keyframes feedbackCheck { 0% { opacity: 0; transform: scale(.4) rotate(-18deg) } 100% { opacity: 1; transform: scale(1) rotate(0) } }
@keyframes feedbackError { 0% { opacity: 0; transform: scale(.65) } 45% { opacity: 1; transform: scale(1.08) } 100% { transform: scale(1) } }

/* Sentence specific */
.chinese-area { padding: 0 0 16px; text-align: center; max-width: 700px; margin: 0 auto }
.chinese-text { font-size: 26px; font-weight: 600; color: #1d1d1f; line-height: 1.7; margin: 0; word-break: break-word; overflow-wrap: break-word }
.slots-area { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: flex-start; padding: 0 0 8px; max-width: 700px; margin: 0 auto }
.slot-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px }
.slots-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; line-height: 2.6; padding: 0 0 8px }
.vis-word { font-size: 19px; color: #1d1d1f; font-weight: 500; padding: 0 4px; cursor: default }
.punct-mark { font-size: 19px; color: #86868b; padding: 0 1px; user-select: none }
.slot-wrapper, .vis-word { position: relative }
.slot-wrapper.correct::after, .slot-item.correct::after { content: ''; position: absolute; inset: -5px; border-radius: 15px; border: 1.5px solid rgba(52,199,89,.45); pointer-events: none; animation: slotSuccessRing .58s ease-out both }
@keyframes slotSuccessRing { 0% { opacity: 0; transform: scale(.82) } 38% { opacity: 1 } 100% { opacity: 0; transform: scale(1.16) } }
.hint-above { position: absolute; z-index: 3; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); font-size: 12px; color: #d96843; font-family: 'SF Mono', Consolas, monospace; letter-spacing: 1px; text-align: center; background: rgba(255,248,244,.96); border: 1px solid rgba(232,115,74,.14); border-radius: 7px; padding: 3px 8px; white-space: nowrap; line-height: 1.4; pointer-events: none; box-shadow: 0 5px 14px rgba(84,49,35,.06) }
.slot-input { box-sizing: border-box; padding: 10px 18px; border: 2px solid rgba(0, 0, 0, .18); border-radius: 10px; font-size: 19px; text-align: center; outline: 0; transition: width .18s ease, border-color .15s ease, background-color .15s ease, box-shadow .15s ease; font-family: inherit; min-width: 76px; background: #fff; color: #1d1d1f }
.slot-input:focus { border-color: #ff7a50; box-shadow: 0 0 0 4px rgba(255,122,80,.1) }
.slot-input.correct { border-color: #2fbd59 !important; background: rgba(239,252,243,.82) !important; color: #238a42 !important; font-weight: 650; cursor: default; box-shadow: inset 0 -2px 0 rgba(47,189,89,.08) }
.slot-input.retry { border-color: #ff9500 !important; background: #fef9f0 !important; color: #ff9500 !important }
.slot-item.shaking .slot-input, .slot-wrapper.shaking .slot-input, .slot-input.shaking { animation: slotReject .44s cubic-bezier(.36,.07,.19,.97) }
@keyframes slotReject { 0%,100% { transform: translateX(0); border-color: rgba(0,0,0,.18) } 18% { transform: translateX(-6px); border-color: #ff453a; background: #fff5f4 } 36% { transform: translateX(5px) } 54% { transform: translateX(-3px); border-color: #ff453a } 72% { transform: translateX(2px) } }

/* Hover word card */
.hover-word-card { position: fixed; bottom: auto; width: min(280px, calc(100vw - 24px)); box-sizing: border-box; transform: translate(-50%, -100%); z-index: 200; background: #fff; color: #1d1d1f; padding: 12px 18px; border-radius: 12px; pointer-events: none; box-shadow: 0 12px 32px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); animation: hoverCardIn .2s ease-out }
.hover-word-card::after { content: ''; position: absolute; top: 100%; left: var(--arrow-left, 50%); transform: translateX(-50%); border: 7px solid transparent; border-top-color: #fff }
@keyframes hoverCardIn { 0% { opacity: 0; transform: translate(-50%, calc(-100% + 6px)) scale(.94) } 100% { opacity: 1; transform: translate(-50%, -100%) scale(1) } }
.hw-top { display: flex; align-items: center; gap: 6px; margin-bottom: 2px }
.hw-word { font-weight: 700; color: #1d1d1f; font-size: 17px; word-break: break-word }
.hw-pos { font-size: 13px; color: #86868b; white-space: nowrap }
.hw-phonetic { color: #ff7a50; font-style: italic; font-size: 14px; margin-bottom: 2px; word-break: break-word }
.hw-loading { color: #86868b; font-size: 12px }
.hw-trans { color: #34c759; font-weight: 600; font-size: 16px; word-break: break-word }

/* —— 底部快捷指令 Dock —— */
.bottom-zone { flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 10px 16px 18px }
.si-items { display: grid; grid-template-columns: repeat(5, 124px); align-items: center; padding: 5px 8px; border: 1px solid rgba(0,0,0,.075); border-radius: 16px; background: rgba(255,255,255,.56); box-shadow: 0 8px 24px rgba(0,0,0,.055), inset 0 1px 0 rgba(255,255,255,.9); backdrop-filter: blur(18px) saturate(1.25); -webkit-backdrop-filter: blur(18px) saturate(1.25) }
.si-item { position: relative; display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 0; min-height: 30px; padding: 0 10px; box-sizing: border-box }
.si-item + .si-item::before { content: ''; position: absolute; left: 0; top: 50%; width: 1px; height: 16px; background: rgba(0,0,0,.07); transform: translateY(-50%) }
.key-sequence { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 3px }
.si-item kbd { display: grid; place-items: center; box-sizing: border-box; min-width: 23px; height: 22px; padding: 0 5px; border: 1px solid rgba(0,0,0,.13); border-bottom-color: rgba(0,0,0,.2); border-radius: 6px; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(245,245,247,.94)); box-shadow: 0 1px 1px rgba(0,0,0,.08), inset 0 -1px 0 rgba(0,0,0,.04); font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 11px; line-height: 1; color: #6e6e73; font-weight: 600; white-space: nowrap }
.si-item kbd.key-wide { min-width: 32px; font-size: 10px; letter-spacing: -.2px }
.si-item kbd.key-mod { min-width: 35px; padding-inline: 5px; font-size: 9px; letter-spacing: -.25px }
.si-action { flex: 0 0 auto; font-size: 12px; line-height: 1; color: #86868b; font-weight: 500; white-space: nowrap }

/* ====== 响应式 ====== */
@media (max-width: 768px) {
  .topbar { min-height: 58px; padding: 9px 10px 2px; gap: 8px }
  .nav-island { min-height: 44px; border-radius: 15px }
  .context-island { gap: 7px; padding: 4px 10px 4px 4px }
  .nav-back { width: 34px; height: 34px; border-radius: 11px }
  .nav-divider, .nav-eyebrow { display: none }
  .brand-signal { width: 16px }
  .nav-context { min-width: 0 }
  .page-title { max-width: 80px; overflow: hidden; text-overflow: ellipsis; font-size: 13px }
  .status-island { gap: 6px; padding: 4px }
  .level-orb { width: 34px; height: 34px }
  .xp-context { display: none }
  .logout-btn { width: 34px; height: 34px }
  .main-content, .card { padding: 40px 16px 16px }
  .top-zone { padding-top: 14px; max-width: 100% }
  .chinese-word { font-size: 34px !important }
  .answer-input { max-width: 260px; font-size: 24px }
  .bottom-zone { padding: 8px 8px 12px; overflow-x: auto; justify-content: flex-start; scrollbar-width: none }
  .bottom-zone::-webkit-scrollbar { display: none }
  .bottom-zone .si-items { grid-template-columns: repeat(5, 72px); margin: 0 auto; padding: 4px 6px; flex-shrink: 0 }
  .si-item { display: flex; justify-content: center; padding: 0 4px }
  .key-sequence { width: auto; min-width: 62px }
  .si-action { display: none }
  .practice-engine { overflow: auto }
  .chinese-text { font-size: 26px }
  .slot-input { font-size: 18px; padding: 6px 10px }
}
@media (max-width: 360px) {
  .chinese-text { font-size: 22px }
  .slot-input { font-size: 14px; min-width: 44px; padding: 5px 8px }
  .card-top-row { flex-wrap: wrap; gap: 6px }
}

/* ── 删除确认弹窗 ── */
.modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.35); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; animation: fadeIn .2s ease }
.modal-card { background: #fff; border-radius: 20px; padding: 36px 40px 28px; max-width: 380px; width: 90%; text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,.12); animation: scaleIn .25s ease }
.modal-icon { margin-bottom: 14px }
.modal-title { font-size: 18px; font-weight: 700; color: #1d1d1f; margin: 0 0 8px }
.modal-body { font-size: 14px; color: #6e6e73; line-height: 1.6; margin: 0 0 24px }
.modal-actions { display: flex; gap: 12px; justify-content: center }
.modal-btn { padding: 10px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all .15s }
.modal-btn.cancel { background: rgba(0, 0, 0, .08); color: #6e6e73 }
.modal-btn.cancel:hover { background: rgba(0, 0, 0, .15); color: #1d1d1f }
.modal-btn.confirm { background: #ff3b30; color: #fff; box-shadow: 0 2px 8px rgba(201,74,74,.25) }
.modal-btn.confirm:hover { background: #d6281e; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(201,74,74,.35) }
@keyframes fadeIn { 0%{opacity:0} 100%{opacity:1} }
@keyframes scaleIn { 0%{opacity:0;transform:scale(.92)} 100%{opacity:1;transform:scale(1)} }
</style>
