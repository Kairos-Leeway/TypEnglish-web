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
import { speak } from '../composables/useTts'
import { playChime, playKeytap } from '../composables/useChime'
import { celebrate } from '../composables/useConfetti'
import { useWordLookup } from '../composables/useWordLookup'
import { useXp } from '../composables/useXp'
import { useAuthStore } from '../stores/auth'

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
const isReview = computed(() => {
  const r = route.query.review as string
  return r === 'word' || r === 'sentence'
})
const isReviewWord = computed(() => route.query.review === 'word')
const isReviewSentence = computed(() => route.query.review === 'sentence')

// ============================================================
// Shared state
// ============================================================
const loading = ref(true)
const finished = ref(false)
const completed = ref(false) // true: 做完所有题; false: 中途结束
const currentIndex = ref(0)
const language = ref('en')
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
const sentences = ref<any[]>([])
const slots = ref<WordSlot[]>([])
const sentenceResults = ref<Array<{ word: string; wordId: number | null; correct: boolean; answer: string }>>([])
const reviewData = ref<any[]>([])

const hoveredIdx = ref<number | null>(null)
const hoveredDetail = ref<WordDetail | null>(null)
const hoverTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hideTimer = ref<ReturnType<typeof setTimeout> | null>(null)

async function onWordHover(slot: WordSlot) {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  if (hideTimer.value) { clearTimeout(hideTimer.value); hideTimer.value = null }
  hoveredIdx.value = slot.index; hoveredDetail.value = null
  hoverTimer.value = setTimeout(async () => {
    const detail = await lookup(language.value, slot.word)
    if (hoveredIdx.value === slot.index) hoveredDetail.value = detail
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
  sentenceResults.value = []
  nextTick(() => { (document.querySelector('.slot-input') as HTMLInputElement)?.focus() })
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

function recordSlot(slot: WordSlot, correct: boolean) {
  const wordText = slot.word.replace(/[^a-zA-Z'-]/g, '')
  sentenceResults.value.push({ word: wordText, wordId: slot.wordId, correct, answer: slot.userInput })
}

function recordRemainingSlots() {
  for (const s of slots.value) {
    const isBlank = mode.value === 'cloze' ? !s.visible : !s.punctuation
    if (isBlank && s.status !== 'correct') {
      const wordText = s.word.replace(/[^a-zA-Z'-]/g, '')
      sentenceResults.value.push({ word: wordText, wordId: s.wordId, correct: false, answer: s.userInput || '(未填)' })
    }
  }
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
    gainXp(10)
    if (mode.value === 'cloze') recordSlot(slot, true)
    checkAllDone()
    return true
  } else {
    slot.status = 'retry'; slot.shaking = true; slot.wrongCount++
    setTimeout(() => slot.shaking = false, 500)
    if (mode.value === 'cloze') recordSlot(slot, false)
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
    // 句子模式只记句子级记录，不走单词批量提交
    if (!isSentenceMode.value) submitBatchResults()
    celebrate()
    gainXp(30)
    setTimeout(() => nextItem(), 1000)
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
  const w = slot.word
  const shown = w.substring(0, slot.hintLevel)
  const hidden = '_ '.repeat(w.length - slot.hintLevel).trim()
  return `${shown} ${hidden}`
}

// ============================================================
// Loading
// ============================================================
async function loadData() {
  loading.value = true; finished.value = false; completed.value = false; correctCount.value = 0

  if (isSentenceMode.value) {
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
        const { data } = await api.get('/sentences', { params: { count: 10 } })
        sentences.value = data
      }
      if (sentences.value.length > 0) {
        currentIndex.value = 0
        initSlots(sentences.value[0].words)
      }
    } catch (e) { console.error(e) }
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
      const { data } = await api.post('/practice/session', { language: 'en', mode: 'typing', count: 10, category: selectedCategory.value || undefined })
      words.value = data.words
    }
    await nextTick(); inputRef.value?.focus()
  } catch (e: any) { console.error(e) }
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
    .map(s => ({ wordId: s.wordId, wordText: s.word, correct: s.status === 'correct', answer: s.userInput || '' }))
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
  if (isReviewSentence.value) submitBatchResults()
  if (mode.value === 'cloze') recordRemainingSlots()
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
  api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: false, answer: '(跳过)' }).catch(() => { })
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
    playChime(); gainXp(5); showFeedback('ok')
    results.value.push({ word: cur, correct: true, answer: input, attempts: attempts.value + 1 })
    if (attempts.value === 0) correctCount.value++
    await api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: true, answer: input }).catch(() => { })
    setTimeout(() => nextItem(), 300); return
  }
  attempts.value++; shaking.value = true; setTimeout(() => shaking.value = false, 500)
  if (attempts.value >= MAX_ATTEMPTS) {
    showAnswer.value = true; showHint.value = false; mustRetype.value = true
    showFeedback('err', '正确答案已显示')
    results.value.push({ word: cur, correct: false, answer: input, attempts: attempts.value })
    await api.post('/practice/submit', { wordId: cur.id, mode: 'typing', correct: false, answer: input }).catch(() => { })
    userInput.value = ''
  } else if (attempts.value >= 2) { showHint.value = true; showFeedback('hint', '再试一次'); userInput.value = '' }
  else { showFeedback('err', '不对，请重试'); userInput.value = '' }
  await nextTick(); inputRef.value?.focus()
}

function showHintForSentence() {
  const s = slots.value.find(s => {
    const isBlank = mode.value === 'cloze' ? !s.visible : !s.punctuation
    return isBlank && (s.status === 'pending' || s.status === 'retry')
  })
  if (!s) return
  s.hintLevel = Math.min(s.hintLevel + 1, s.word.length)
  const el = document.querySelector(`[data-slot="${s.index}"]`) as HTMLInputElement
  if (el) el.focus()
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
}

function submitRemaining() {
  // 不再使用——结束后不再自动提交
}

function checkSentenceAllDone(): boolean {
  const blanks = slots.value.filter(s => mode.value === 'cloze' ? !s.visible : !s.punctuation)
  return blanks.length > 0 && blanks.every(s => s.status === 'correct')
}

// "结束" button: go directly home — 不记录，直接走人
function endNow() {
  router.push('/')
}

function restart() {
  finished.value = false; completed.value = false; currentIndex.value = 0; correctCount.value = 0
  if (isSentenceMode.value) { sentences.value = []; slots.value = []; sentenceResults.value = [] }
  else { words.value = []; userInput.value = ''; results.value = []; attempts.value = 0; showHint.value = false; showAnswer.value = false; mustRetype.value = false }
  loadData()
}

// 3s auto-countdown on full completion
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
watch(finished, (val) => {
  if (val && completed.value) {
    countdown.value = 3
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) { if (countdownTimer) clearInterval(countdownTimer); restart() }
    }, 1000)
  }
})
onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer) })

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
const totalItems = computed(() => isSentenceMode.value ? sentences.value.length : words.value.length)
const itemLabel = computed(() => isSentenceMode.value ? '句' : '题')
const accuracyPct = computed(() => {
  if (isSentenceMode.value && mode.value === 'cloze') return 0 // cloze doesn't track per-item completion well
  return completed.value ? (totalItems.value > 0 ? Math.round(correctCount.value / Math.max(1, (isSentenceMode.value ? sentences.value.length * slots.value.filter(s => mode.value === 'cloze' ? !s.visible : !s.punctuation).length : totalItems.value)) * 100) : 0) : 0
})

const shortReviewSentences = computed(() => reviewData.value.length > 0)

const pageTitle = computed(() => {
  if (isReviewWord.value) return 'TypEnglish · 错题复习'
  if (isReviewSentence.value) return 'TypEnglish · 错题复习'
  if (mode.value === 'spelling') return 'TypEnglish · 拼写练习'
  if (mode.value === 'cloze') return 'TypEnglish · 完形填空'
  return 'TypEnglish · 句子翻译'
})
</script>

<template>
  <div class="practice-engine">
    <!-- ========== TOPBAR ========== -->
    <header class="topbar">
      <router-link to="/" class="logo-link"><span class="logo-icon">T</span></router-link>
      <span class="page-title">{{ pageTitle }}</span>
      <div style="flex:1" />
      <div class="xp-bar">
        <span class="xp-label">Lv.{{ level }}</span>
        <el-progress :percentage="progress" :show-text="false" :stroke-width="4" style="width:72px" color="#10b981" />
      </div>
      <button class="logout-btn" @click="auth.logout(); router.push('/login')">退出</button>
    </header>

    <!-- ========== LOADING ========== -->
    <div v-if="loading" class="center-state">
      <div class="loader" /><p>{{ isSentenceMode ? '加载句子中...' : '准备题目中...' }}</p>
    </div>

    <!-- ========== RESULT PANEL ========== -->
    <div v-else-if="finished" class="result-panel">
      <div class="result-icon-wrap">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h2>{{ completed ? '练习完成' : '已结束' }}</h2>

      <!-- Spelling result -->
      <template v-if="!isSentenceMode">
        <p class="result-meta">{{ words.length }} 题 · {{ results.filter(r => r.correct).length }} 正确</p>
        <div class="result-big-num">{{ words.length > 0 ? Math.round(results.filter(r => r.correct).length / words.length * 100) : 0 }}%</div>
        <div class="result-words">
          <span v-for="(r, i) in results" :key="i" :class="['rw-chip', r.correct ? 'rw-ok' : 'rw-err']">{{ r.word.word }}</span>
        </div>
      </template>

      <!-- Sentence result -->
      <template v-else>
        <p class="result-meta">{{ sentences.length }} 个句子{{ mode === 'cloze' ? ' · 正确 ' + correctCount + ' 个空' : '' }}</p>
      </template>

      <!-- Actions: only for fully completed -->
      <template v-if="completed">
        <p v-if="countdown > 0" class="countdown-hint">{{ countdown }}s 后自动再来一轮</p>
        <div class="result-actions">
          <router-link v-if="isReviewSentence" to="/errorbook" class="retry-btn" style="display:inline-block;text-decoration:none">返回错题本</router-link>
          <router-link v-else to="/" class="retry-btn" style="display:inline-block;text-decoration:none">返回首页</router-link>
          <button class="retry-btn secondary" @click="restart()">再来一轮</button>
          <button v-if="!isSentenceMode && results.filter(r => !r.correct).length > 0" class="retry-btn outline" @click="retryWrong()">复习错题 ({{ results.filter(r => !r.correct).length }})</button>
        </div>
      </template>
      <template v-else>
        <button class="retry-btn" style="margin-top:16px" @click="router.push('/')">返回首页</button>
      </template>
    </div>

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
              <button class="tool-btn speak" @click="speak(words[currentIndex]?.word)" title="听发音">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                <span>朗读</span>
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
          <div class="input-row">
            <input ref="inputRef" v-model="userInput" class="answer-input" :class="{ wrong: shaking, revealed: showAnswer }" placeholder="输入单词..." autocomplete="off" spellcheck="false" @keyup.enter="submitWord()" @keydown="playKeytap()" />
            <button class="speak-btn" @click="speak(words[currentIndex].word)" :disabled="showAnswer" title="听发音">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
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
          <span class="si-label">快捷键</span>
          <div class="si-items">
            <span class="si-item"><kbd>↵</kbd><span>确认</span></span>
            <span class="si-item"><kbd>Ctrl+H</kbd><span>朗读</span></span>
            <span class="si-item"><kbd>Ctrl+I</kbd><span>提示</span></span>
            <span class="si-item"><kbd>Ctrl+S</kbd><span>跳过</span></span>
            <span class="si-item"><kbd>Esc</kbd><span>返回</span></span>
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
              <button class="tool-btn hint" @click="showHintForSentence" title="显示提示 (Ctrl+I)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/></svg>
                <span>提示</span>
              </button>
              <button class="tool-btn speak" @click="speak(sentences[currentIndex].english)" title="听发音">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                <span>朗读</span>
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
              <span v-else-if="mode === 'cloze' && !s.visible" class="slot-wrapper" @mouseenter="s.status === 'correct' ? onWordHover(s) : null" @mouseleave="s.status === 'correct' ? onWordLeave() : null">
                <div v-if="hintLabel(s)" class="hint-above">{{ hintLabel(s) }}</div>
                <input :data-slot="s.index" v-model="s.userInput" :class="['slot-input', s.status, { shaking: s.shaking }]" :disabled="s.status === 'correct'" :style="{ width: Math.max(s.word.length * 14 + 20, 56) + 'px' }" spellcheck="false" autocomplete="off" @keydown="onSlotKeydown($event, s, i)" />
                <div v-if="hoveredIdx === s.index && s.status === 'correct'" class="hover-word-card" :class="{ loaded: hoveredDetail }">
                  <div class="hw-top"><span class="hw-word">{{ s.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
                  <div v-if="hoveredDetail?.phonetic" class="hw-phonetic">/{{ hoveredDetail.phonetic }}/</div>
                  <div v-if="!hoveredDetail" class="hw-loading">查询中...</div>
                  <div v-if="hoveredDetail?.translation" class="hw-trans">{{ hoveredDetail.translation }}</div>
                </div>
              </span>
              <!-- Visible word (cloze) -->
              <span v-else-if="mode === 'cloze' && s.visible" class="vis-word" @mouseenter="onWordHover(s)" @mouseleave="onWordLeave">
                {{ s.word }}
                <div v-if="hoveredIdx === s.index" class="hover-word-card" :class="{ loaded: hoveredDetail }">
                  <div class="hw-top"><span class="hw-word">{{ s.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
                  <div v-if="hoveredDetail?.phonetic" class="hw-phonetic">/{{ hoveredDetail.phonetic }}/</div>
                  <div v-if="!hoveredDetail" class="hw-loading">查询中...</div>
                  <div v-if="hoveredDetail?.translation" class="hw-trans">{{ hoveredDetail.translation }}</div>
                </div>
              </span>
              <!-- Translation mode: all non-punctuation are blanks -->
              <div v-else :class="['slot-item', s.status, { shaking: s.shaking }]" @mouseenter="s.status === 'correct' ? onWordHover(s) : null" @mouseleave="s.status === 'correct' ? onWordLeave() : null">
                <div v-if="hintLabel(s)" class="hint-above">{{ hintLabel(s) }}</div>
                <input :data-slot="s.index" v-model="s.userInput" class="slot-input" :class="s.status" :disabled="s.status === 'correct'" :style="{ width: Math.max(s.word.length * 14 + 20, 60) + 'px' }" spellcheck="false" autocomplete="off" @keydown="onSlotKeydown($event, s, i)" />
                <div v-if="hoveredIdx === s.index && s.status === 'correct'" class="hover-word-card" :class="{ loaded: hoveredDetail }">
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
          <span class="si-label">快捷键</span>
          <div class="si-items">
            <span class="si-item"><kbd>← Tab →</kbd><span>切换空位</span></span>
            <span class="si-item"><kbd>Ctrl+H</kbd><span>朗读</span></span>
            <span class="si-item"><kbd>Ctrl+I</kbd><span>提示</span></span>
            <span class="si-item"><kbd>Ctrl+S</kbd><span>跳过</span></span>
            <span class="si-item"><kbd>Esc</kbd><span>返回</span></span>
          </div>
        </div>
      </div>
    </template>

    <!-- Delete confirm dialog (spelling only) -->
    <el-dialog v-model="deleteConfirmVisible" title="确认删除" width="380px" center>
      <p style="text-align:center;margin:16px 0;color:#475569;font-size:15px">
        <template v-if="deleteTargetType === 'word'">从题库中删除 <strong style="color:#1e293b">"{{ deleteTargetWord }}"</strong>？</template>
        <template v-else>确定删除此题？</template>
      </p>
      <template #footer><el-button @click="deleteConfirmVisible = false">取消</el-button><el-button type="danger" @click="deleteTargetType === 'word' ? doDeleteWord() : doDeleteSentence()">删除</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ====== 全局 ====== */
.practice-engine { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: #fef9f4 }

/* ====== 顶栏 ====== */
.topbar { display: flex; align-items: center; padding: 0 24px; height: 56px; background: rgba(255, 255, 255, .78); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid rgba(184, 160, 151, .15); flex-shrink: 0; z-index: 10 }
.logo-link { text-decoration: none }
.logo-icon { width: 34px; height: 34px; background: #e8734a; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700 }
.page-title { font-size: 17px; font-weight: 600; color: #2d2422; margin-left: 10px }
.xp-bar { display: flex; align-items: center; gap: 6px; margin-right: 2px }
.xp-label { font-size: 14px; font-weight: 600; color: #e8734a; white-space: nowrap }
.logout-btn { margin-left: 14px; padding: 6px 14px; border: 1px solid rgba(184, 160, 151, .18); border-radius: 8px; background: rgba(255, 255, 255, .5); color: #b8a097; font-size: 13px; cursor: pointer; transition: all .15s; font-family: inherit }
.logout-btn:hover { border-color: #c94a4a; color: #c94a4a }

/* ====== 加载 ====== */
.center-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #b8a097; gap: 16px }
.loader { width: 28px; height: 28px; border: 2px solid rgba(184, 160, 151, .18); border-top-color: #e8734a; border-radius: 50%; animation: spin .7s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }

/* ====== 结果面板 ====== */
.result-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 48px 24px }
.result-icon-wrap { width: 60px; height: 60px; background: #fef3ee; border-radius: 14px; display: flex; align-items: center; justify-content: center }
.result-panel h2 { font-size: 26px; font-weight: 700; color: #2d2422; margin: 0 }
.result-meta { font-size: 17px; color: #b8a097; margin: 0 }
.result-big-num { font-size: 72px; font-weight: 800; color: #e8734a; line-height: 1 }
.result-words { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 560px }
.rw-chip { padding: 8px 18px; border-radius: 10px; font-size: 17px; font-weight: 500 }
.rw-ok { background: #f3f9f3; color: #5b9a5e }
.rw-err { background: #fdf0f0; color: #c94a4a }
.result-actions { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content: center }
.countdown-hint { font-size: 15px; color: #e8734a; font-weight: 600; animation: pulse 1s ease-in-out infinite }
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
.retry-btn { margin-top: 8px; padding: 13px 44px; background: #e8734a; color: #fff; border: none; border-radius: 12px; font-size: 18px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: inherit }
.retry-btn:hover { background: #d4653a; transform: translateY(-1px) }
.retry-btn.secondary { padding: 13px 36px; background: #5b9a5e; font-size: 16px }
.retry-btn.secondary:hover { background: #4a8a4e }
.retry-btn.outline { padding: 13px 36px; background: #fff; color: #c9782d; border: 2px solid rgba(232, 164, 74, .35); font-size: 16px }
.retry-btn.outline:hover { background: #fef9f0; border-color: #e8734a; transform: translateY(-1px) }

/* ====== 主体内容区 ====== */
.main-content, .card { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0 24px }

/* —— 顶部 —— */
.top-zone { flex-shrink: 0; padding-top: 20px; max-width: 720px; width: 100%; margin: 0 auto }
.progress-bar { width: 100%; height: 3px; background: rgba(184, 160, 151, .15); border-radius: 2px; overflow: hidden }
.progress-fill { height: 100%; background: #e8734a; border-radius: 2px; transition: width .4s ease }
.progress-row, .card-top-row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px }
.counter { font-size: 16px; color: #b8a097; font-weight: 500 }
.attempts-badge { font-size: 13px; color: #c94a4a; font-weight: 600; text-align: center; margin-top: 10px }
.progress-actions, .top-actions { display: flex; gap: 6px; align-items: center }

/* ── 工具栏按钮 ── */
.tool-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: all .2s ease;
  border: 1px solid rgba(184,160,151,.15);
  color: #8b7b74;
  box-shadow: 0 1px 2px rgba(184,160,151,.08);
  user-select: none;
}
.tool-btn svg { flex-shrink: 0; transition: transform .2s ease }
.tool-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(184,160,151,.18);
  border-color: rgba(184,160,151,.28);
}
.tool-btn:active { transform: translateY(0) scale(.97); box-shadow: 0 1px 2px rgba(184,160,151,.06); transition: transform .06s ease }
.tool-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: 0 1px 2px rgba(184,160,151,.08) }

.tool-btn.hint { background: linear-gradient(180deg, #faf9fe 0%, #f3f0fc 100%); color: #7c6fba }
.tool-btn.hint:hover { color: #5b4fa6; border-color: rgba(124,111,186,.3); box-shadow: 0 4px 14px rgba(124,111,186,.12) }
.tool-btn.hint:hover svg { transform: rotate(-12deg) }

.tool-btn.speak { background: linear-gradient(180deg, #fefaf7 0%, #fdf3eb 100%); color: #d4906a }
.tool-btn.speak:hover { color: #c07448; border-color: rgba(196,148,106,.3); box-shadow: 0 4px 14px rgba(196,148,106,.12) }
.tool-btn.speak:hover svg { transform: scale(1.15) }

.tool-btn.skip { background: linear-gradient(180deg, #f9fcfa 0%, #eff7f2 100%); color: #7cae8c }
.tool-btn.skip:hover { color: #5a8a6a; border-color: rgba(124,174,140,.3); box-shadow: 0 4px 14px rgba(124,174,140,.12) }
.tool-btn.skip:hover svg { transform: translateX(2px) }

.tool-btn.delete { background: linear-gradient(180deg, #fefafa 0%, #fdf2f2 100%); color: #c47a7a }
.tool-btn.delete:hover { color: #a85a5a; border-color: rgba(196,122,122,.3); box-shadow: 0 4px 14px rgba(196,122,122,.12) }
.tool-btn.delete:hover svg { transform: rotate(90deg) }

.tool-btn.end {
  color: #d4653a; border-color: rgba(232,115,74,.15);
  background: linear-gradient(180deg, #fef9f4 0%, #fef3ee 100%);
  box-shadow: 0 1px 3px rgba(232,115,74,.08);
}
.tool-btn.end:hover {
  color: #b33a3a; border-color: rgba(232,115,74,.35);
  box-shadow: 0 4px 16px rgba(232,115,74,.2);
}
.tool-btn.end:hover svg { transform: rotate(90deg) scale(1.1) }

/* —— 中间 —— */
.mid-zone { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; gap: 0 }

/* Spelling specific */
.example-banner { max-width: 560px; text-align: center; margin: 0 auto 48px }
.example-full { font-size: 17px; color: #2d2422; line-height: 1.6; font-style: italic }
.example-masked { font-size: 17px; color: #2d2422; line-height: 1.6; font-style: italic }
.example-masked :deep(.ex-blank) { display: inline-flex; gap: 3px; background: rgba(232, 115, 74, .08); border-bottom: 2px solid #e8734a; padding: 0 6px; margin: 0 2px; border-radius: 3px 3px 0 0 }
.example-masked :deep(.ex-char) { display: inline-block; width: 14px; text-align: center; font-style: normal; font-weight: 600; font-size: 16px; color: #2d2422 }
.example-masked :deep(.ex-char:not(.filled)) { color: #cbd5e1 }
.card-body { text-align: center; max-width: 560px }
.chinese-word { font-size: 44px; font-weight: 700; color: #2d2422; margin: 0; line-height: 1.3; word-break: break-word }
.phonetic-text { font-size: 18px; color: #e8734a; margin: 10px 0 0; font-family: Georgia, serif }
.pos-tag { font-size: 16px; color: #b8a097; margin: 6px 0 0; font-style: italic }
.hint-text { margin-top: 14px; font-size: 18px; color: #e8734a; background: #fef3ee; display: inline-block; padding: 6px 18px; border-radius: 8px; font-family: 'SF Mono', monospace; letter-spacing: 2px }
.reveal-answer { margin-top: 14px; font-size: 22px; color: #c94a4a; font-weight: 700; background: #fdf0f0; display: inline-block; padding: 6px 18px; border-radius: 8px }
.input-row { display: flex; align-items: flex-end; justify-content: center; gap: 0; margin-top: 36px }
.answer-input { width: 100%; max-width: 480px; padding: 12px 0; border: none; border-bottom: 2.5px solid rgba(184, 160, 151, .25); font-size: 28px; outline: 0; text-align: center; font-family: inherit; background: transparent; transition: border-color .2s; border-radius: 0; letter-spacing: 1px; box-sizing: border-box; color: #2d2422 }
.answer-input::placeholder { color: rgba(184, 160, 151, .25) }
.answer-input:focus { border-bottom-color: #e8734a }
.answer-input.revealed { border-bottom-color: #f5a5a5; color: #c94a4a }
.speak-btn { width: 40px; height: 40px; border: none; border-radius: 10px; background: rgba(184, 160, 151, .06); color: #b8a097; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all .15s; margin-left: 8px }
.speak-btn:hover { background: rgba(184, 160, 151, .18); color: #4a3d39 }
.feedback-toast { position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%) translateY(8px); z-index: 200; opacity: 0; transition: all .25s ease; pointer-events: none }
.feedback-toast.fb-show { opacity: 1; transform: translateX(-50%) translateY(0) }
.fb-inner { display: flex; align-items: center; gap: 8px; padding: 10px 22px; border-radius: 20px; font-size: 16px; font-weight: 600; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); white-space: nowrap }
.fb-ok .fb-inner { background: rgba(91, 154, 94, .12); color: #3d7a40; border: 1px solid rgba(91, 154, 94, .2) }
.fb-err .fb-inner { background: rgba(201, 74, 74, .1); color: #b33a3a; border: 1px solid rgba(201, 74, 74, .18) }
.fb-hint .fb-inner { background: rgba(232, 164, 74, .1); color: #c9782d; border: 1px solid rgba(232, 164, 74, .2) }

/* Sentence specific */
.chinese-area { padding: 0 0 16px; text-align: center }
.chinese-text { font-size: 30px; font-weight: 600; color: #2d2422; line-height: 1.6; margin: 0; word-break: break-word }
.slots-area { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: flex-start; padding: 0 0 8px }
.slot-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px }
.slots-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; line-height: 2.6; padding: 0 0 8px }
.vis-word { font-size: 19px; color: #4a3d39; font-weight: 500; padding: 0 4px; cursor: default }
.punct-mark { font-size: 19px; color: #b8a097; padding: 0 1px; user-select: none }
.slot-wrapper, .vis-word { position: relative }
.hint-above { font-size: 14px; color: #e8734a; font-family: monospace; letter-spacing: 2px; text-align: center; margin-bottom: 4px; background: #fef3ee; border-radius: 6px; padding: 2px 8px; white-space: nowrap; line-height: 1.4 }
.slot-input { padding: 10px 16px; border: 2px solid rgba(184, 160, 151, .18); border-radius: 10px; font-size: 19px; text-align: center; outline: 0; transition: all .15s; font-family: inherit; min-width: 56px; background: #fff; color: #2d2422 }
.slot-input:focus { border-color: #e8734a }
.slot-input.correct { border-color: #5b9a5e !important; background: #f3f9f3 !important; color: #5b9a5e !important; font-weight: 600; cursor: default }
.slot-input.retry { border-color: #e8a44a !important; background: #fef9f0 !important; color: #c9782d !important }
.slot-item.shaking .slot-input { animation: shakeRed .5s ease }
.slot-input.shaking { animation: shakeRed .5s ease }
@keyframes shakeRed { 0%, 100% { border-color: rgba(184, 160, 151, .18) } 10%, 50%, 90% { border-color: #c94a4a; background: #fdf0f0 } }

/* Hover word card */
.hover-word-card { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); z-index: 200; background: #fff; color: #2d2422; padding: 10px 14px; border-radius: 12px; min-width: 130px; pointer-events: none; box-shadow: 0 12px 32px rgba(0, 0, 0, .1), 0 0 0 1px rgba(0, 0, 0, .04); animation: hoverCardIn .2s ease-out }
.hover-word-card::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 7px solid transparent; border-top-color: #fff }
@keyframes hoverCardIn { 0% { opacity: 0; transform: translateX(-50%) translateY(6px) scale(.94) } 100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) } }
.hw-top { display: flex; align-items: center; gap: 6px; margin-bottom: 2px }
.hw-word { font-weight: 700; color: #2d2422; font-size: 17px }
.hw-pos { font-size: 13px; color: #b8a097 }
.hw-phonetic { color: #e8734a; font-style: italic; font-size: 14px; margin-bottom: 2px }
.hw-loading { color: #b8a097; font-size: 12px }
.hw-trans { color: #5b9a5e; font-weight: 600; font-size: 16px }

/* —— 底部 —— */
.bottom-zone { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 28px; padding: 14px 0 18px }
.si-label { font-size: 13px; font-weight: 600; color: #b8a097; text-transform: uppercase; letter-spacing: 1.5px; flex-shrink: 0 }
.si-items { display: flex; align-items: center; gap: 24px }
.si-item { display: inline-flex; align-items: center; gap: 4px }
.si-item kbd { display: inline-block; padding: 2px 8px; border: 1px solid rgba(184, 160, 151, .18); border-radius: 4px; background: rgba(184, 160, 151, .08); font-size: 13px; font-family: inherit; color: #b8a097; font-weight: 500; white-space: nowrap }
.si-item span { font-size: 13px; color: #b8a097 }

/* ====== 响应式 ====== */
@media (max-width: 768px) {
  .topbar { padding: 0 16px; height: 50px }
  .page-title { font-size: 14px }
  .main-content, .card { padding: 0 16px }
  .top-zone { padding-top: 14px; max-width: 100% }
  .chinese-word { font-size: 34px !important }
  .answer-input { max-width: 260px; font-size: 24px }
  .bottom-zone { gap: 12px; padding: 10px 0 14px }
  .bottom-zone .si-items { gap: 10px; flex-wrap: wrap; justify-content: center }
  .bottom-zone .si-label { display: none }
  .practice-engine { overflow: auto }
  .chinese-text { font-size: 26px }
  .slot-input { font-size: 18px; padding: 6px 10px }
}
@media (max-width: 360px) {
  .chinese-text { font-size: 22px }
  .slot-input { font-size: 14px; min-width: 44px; padding: 5px 8px }
  .card-top-row { flex-wrap: wrap; gap: 6px }
}
</style>
