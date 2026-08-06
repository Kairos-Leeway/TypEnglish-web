<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { speak } from '../composables/useTts'
import { useWordLookup } from '../composables/useWordLookup'
import { celebrate } from '../composables/useConfetti'
import { playKeytap } from '../composables/useChime'
import { useXp } from '../composables/useXp'
import api from '../api'

const route = useRoute()
const isReview = ref(route.query.review === 'sentence')
const reviewData = ref<any[]>([])

const { level, progress, gain: gainXp } = useXp()

interface WordSlot {
  index: number; word: string; wordId: number | null; punctuation: boolean; userInput: string
  status: 'pending' | 'correct' | 'retry'
  shaking: boolean; hintLevel: number; wrongCount: number
  translation?: string; phonetic?: string
}

interface WordDetail {
  found: boolean; word: string; phonetic?: string; translation?: string
  partOfSpeech?: string; example?: string
}

const { lookup } = useWordLookup()
const sentences = ref<any[]>([])
const currentIndex = ref(0)
const slots = ref<WordSlot[]>([])
const loading = ref(true)
const finished = ref(false)
const correctCount = ref(0)
const language = ref('en')
const MAX_WRONG_BEFORE_HINT = 3

const hoveredIdx = ref<number | null>(null)
const hoveredDetail = ref<WordDetail | null>(null)
const hoverTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hideTimer = ref<ReturnType<typeof setTimeout> | null>(null)

async function onWordHover(slot: WordSlot) {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  if (hideTimer.value) { clearTimeout(hideTimer.value); hideTimer.value = null }
  hoveredIdx.value = slot.index
  hoveredDetail.value = null
  hoverTimer.value = setTimeout(async () => {
    const detail = await lookup(language.value, slot.word)
    if (hoveredIdx.value === slot.index) hoveredDetail.value = detail
  }, 100)
}

function onWordLeave() {
  if (hoverTimer.value) clearTimeout(hoverTimer.value)
  hideTimer.value = setTimeout(() => { hoveredIdx.value = null; hoveredDetail.value = null }, 150)
}

function initSlots(words: Array<{ index: number; word: string; wordId: number | null; translation?: string; phonetic?: string; punctuation?: boolean }>) {
  slots.value = words.map(w => ({
    index: w.index, word: w.word, wordId: w.wordId, punctuation: w.punctuation === true, userInput: '', status: 'pending' as const,
    shaking: false, hintLevel: 0, wrongCount: 0, translation: w.translation, phonetic: w.phonetic
  }))
  nextTick(() => { (document.querySelector('.slot-input') as HTMLInputElement)?.focus() })
}

async function loadSentences() {
  loading.value = true
  try {
    if (isReview.value) {
      const raw = localStorage.getItem('reviewSentences')
      if (!raw) { finished.value = true; loading.value = false; return }
      reviewData.value = JSON.parse(raw)
      sentences.value = reviewData.value.map((se: any) => ({
        id: se.sentenceId, english: se.english, chinese: se.chinese,
        words: se.slots.map((s: any) => ({
          index: s.index, word: s.word, wordId: null,
          punctuation: s.visible || false, translation: undefined, phonetic: undefined
        }))
      }))
    } else {
      const { data } = await api.get('/sentences', { params: { count: 10 } })
      sentences.value = data
    }
    if (sentences.value.length > 0) initSlots(sentences.value[0].words)
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

function submitBatchResults() {
  if (isReview.value) {
    const se = reviewData.value[currentIndex.value]
    if (!se) return
    const results = slots.value.map(s => ({
      index: s.index, word: s.word, visible: s.punctuation,
      correct: s.status === 'correct', answer: s.userInput || ''
    }))
    const hiddenSlots = results.filter(s => !s.visible)
    const correctSlots = hiddenSlots.filter(s => s.correct).length
    api.put(`/errorbook/sentences/${se.id}`, { totalSlots: hiddenSlots.length, correctSlots, slotResults: results }).catch(() => {})
    return
  }
  const items = slots.value.filter(s => !s.punctuation).map(s => ({
    wordId: s.wordId, wordText: s.word, correct: s.status === 'correct', answer: s.userInput || ''
  }))
  if (items.length === 0) return
  api.post('/practice/submit-batch', { mode: 'translation', language: language.value, items }).catch(() => {})
}

function validateSlot(slot: WordSlot): boolean {
  if (slot.status === 'correct' || slot.punctuation) return true
  const input = slot.userInput.trim()
  if (!input) return false
  const ok = input.toLowerCase() === slot.word.toLowerCase()
  if (ok) {
    slot.status = 'correct'; correctCount.value++
    gainXp(10)
    checkAllDone()
    return true
  } else {
    slot.status = 'retry'; slot.shaking = true; slot.wrongCount++
    setTimeout(() => slot.shaking = false, 500)
    if (slot.wrongCount >= MAX_WRONG_BEFORE_HINT) {
      slot.hintLevel = Math.min(slot.hintLevel + 1, slot.word.length)
      slot.wrongCount = 0
    }
    slot.userInput = ''
    return false
  }
}

function checkAllDone() {
  const contentSlots = slots.value.filter(s => !s.punctuation)
  if (contentSlots.length > 0 && contentSlots.every(s => s.status === 'correct')) {
    submitBatchResults()
    celebrate()
    gainXp(30)
    setTimeout(() => nextSentence(), 1000)
  }
}

function moveToSlot(fromIdx: number, direction: number) {
  let next = fromIdx + direction
  while (next >= 0 && next < slots.value.length) {
    if (!slots.value[next].punctuation && slots.value[next].status !== 'correct') {
      const el = document.querySelector(`[data-slot="${slots.value[next].index}"]`) as HTMLInputElement; el?.focus(); el?.select(); return
    }
    next += direction
  }
}

function onSlotKeydown(e: KeyboardEvent, slot: WordSlot, idx: number) {
  playKeytap()
  // Space / Tab / ArrowRight: 校验当前 → 跳到下一个空
  if (e.key === ' ' || e.key === 'Tab' || e.key === 'ArrowRight') { e.preventDefault(); validateSlot(slot); moveToSlot(idx, 1); return }
  // ArrowLeft: 回到上一个空
  if (e.key === 'ArrowLeft') { e.preventDefault(); validateSlot(slot); moveToSlot(idx, -1); return }
  if (e.key === 'Enter') { e.preventDefault(); const ok = validateSlot(slot); if (ok) moveToSlot(idx, 1) }
}

function showHint() {
  const s = slots.value.find(s => !s.punctuation && (s.status === 'pending' || s.status === 'retry'))
  if (!s) return
  s.hintLevel = Math.min(s.hintLevel + 1, s.word.length)
  const el = document.querySelector(`[data-slot="${s.index}"]`) as HTMLInputElement
  if (el) el.focus()
}

function hintLabel(slot: WordSlot): string {
  if (slot.hintLevel === 0 || slot.status === 'correct') return ''
  const w = slot.word
  const shown = w.substring(0, slot.hintLevel)
  const hidden = '_ '.repeat(w.length - slot.hintLevel).trim()
  return `${shown} ${hidden}`
}

function skipSentence() {
  if (isReview.value) submitBatchResults()
  submitSentenceError()
  // 只剩最后一题时跳过，标记为完成并提示"练习结束"而非"练习完成"
  if (currentIndex.value >= sentences.value.length - 1) {
    finished.value = true
    if (isReview.value) localStorage.removeItem('reviewSentences')
    return
  }
  nextSentence()
}

function submitSentenceError() {
  const sent = sentences.value[currentIndex.value]
  if (!sent) return
  const contentSlots = slots.value.filter(s => !s.punctuation)
  const totalSlots = contentSlots.length
  const correctSlots = contentSlots.filter(s => s.status === 'correct').length
  if (totalSlots === correctSlots) return
  if (isReview.value) return
  const slotResults = slots.value.map(s => ({
    index: s.index, word: s.word, visible: s.punctuation,
    correct: s.status === 'correct', answer: s.userInput || ''
  }))
  api.post('/practice/sentence-error', {
    sentenceId: sent.id || null, english: sent.english, chinese: sent.chinese,
    mode: 'translation', totalSlots, correctSlots, slotResults
  }).catch(() => {})
}

function nextSentence() {
  if (currentIndex.value < sentences.value.length - 1) { currentIndex.value++; initSlots(sentences.value[currentIndex.value].words) }
  else { finished.value = true; if (isReview.value) localStorage.removeItem('reviewSentences') }
}

onMounted(loadSentences)

function onGlobalKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod && e.key !== 'Escape') return
  if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); speak(sentences.value[currentIndex.value]?.english) }
  if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); showHint() }
  if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); skipSentence() }
  if (e.key === 'Escape') { e.preventDefault(); finished.value = true }
}
onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <div class="sentence-practice">
    <header class="topbar">
      <router-link to="/" class="logo-link"><span class="logo-icon">T</span></router-link>
      <span class="page-title">{{ isReview ? 'TypEnglish · 错题复习' : 'TypEnglish · 句子翻译' }}</span>
      <div style="flex:1"/>
      <div class="xp-bar"><span class="xp-label">Lv.{{ level }}</span><el-progress :percentage="progress" :show-text="false" :stroke-width="4" style="width:72px" color="#10b981"/></div>
    </header>

    <div v-if="loading" class="center-state"><div class="loader"/><p>加载句子中...</p></div>

    <div v-else-if="finished" class="result-panel">
      <div class="result-icon-wrap"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>
      <h2>{{ isReview ? '复习完成' : '练习完成' }}</h2>
      <p class="result-meta">{{ sentences.length }} 个句子</p>
      <div class="result-actions">
        <router-link v-if="isReview" to="/errorbook" class="retry-btn" style="display:inline-block;text-decoration:none">返回错题本</router-link>
        <router-link v-else to="/" class="retry-btn" style="display:inline-block;text-decoration:none">返回首页</router-link>
        <button v-if="!isReview" class="retry-btn secondary" @click="loadSentences()">再来一轮</button>
      </div>
    </div>

    <template v-else-if="sentences.length>0">
      <div class="sentence-card">
        <div class="top-zone">
          <div class="progress-bar"><div class="progress-fill" :style="{width:(currentIndex/sentences.length*100)+'%'}"/></div>
          <div class="card-top-row">
            <span class="counter">{{currentIndex+1}}/{{sentences.length}}</span>
            <div class="top-actions">
              <button class="mini-btn btn-skip" @click="skipSentence">跳过</button>
              <button class="action-btn" @click="speak(sentences[currentIndex].english)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> 朗读
              </button>
              <button class="action-btn" @click="showHint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/></svg> 提示
              </button>
              <button class="mini-btn btn-end" @click="finished=true">结束</button>
            </div>
          </div>
        </div>
        <div class="mid-zone">
          <div class="chinese-area"><p class="chinese-text">{{sentences[currentIndex].chinese}}</p></div>
          <div class="slots-area">
            <template v-for="(slot,i) in slots" :key="i">
              <span v-if="slot.punctuation" class="punct-mark">{{ slot.word }}</span>
              <div v-else :class="['slot-item',slot.status,{shaking:slot.shaking}]" @mouseenter="slot.status==='correct' ? onWordHover(slot) : null" @mouseleave="slot.status==='correct' ? onWordLeave() : null">
                <div v-if="hintLabel(slot)" class="hint-above">{{hintLabel(slot)}}</div>
                <input :data-slot="slot.index" v-model="slot.userInput" class="slot-input" :class="slot.status" :disabled="slot.status==='correct'" :style="{width:Math.max(slot.word.length*14+20,60)+'px'}" spellcheck="false" autocomplete="off" @keydown="onSlotKeydown($event,slot,i)"/>
                <div v-if="hoveredIdx === slot.index && slot.status==='correct'" class="hover-word-card" :class="{ loaded: hoveredDetail }">
                  <div class="hw-top"><span class="hw-word">{{ slot.word }}</span><span v-if="hoveredDetail?.partOfSpeech" class="hw-pos">{{ hoveredDetail.partOfSpeech }}</span></div>
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
  </div>
</template>

<style scoped>
.sentence-practice{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#fef9f4}

.topbar{display:flex;align-items:center;padding:0 24px;height:56px;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(184,160,151,.15);flex-shrink:0;z-index:10}
.logo-link{text-decoration:none}
.logo-icon{width:34px;height:34px;background:#e8734a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700}
.page-title{font-size:17px;font-weight:600;color:#2d2422;margin-left:10px}
.end-btn-red{padding:7px 20px;background:#c94a4a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;margin-left:16px}.end-btn-red:hover{background:#a83a3a;transform:translateY(-1px)}
.xp-bar{display:flex;align-items:center;gap:6px;margin-right:2px}.xp-label{font-size:14px;font-weight:600;color:#e8734a;white-space:nowrap}

.center-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#b8a097;gap:16px}
.loader{width:28px;height:28px;border:2px solid rgba(184,160,151,.18);border-top-color:#e8734a;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

.result-panel{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:48px 24px}
.result-icon-wrap{width:60px;height:60px;background:#fef3ee;border-radius:14px;display:flex;align-items:center;justify-content:center}
.result-panel h2{font-size:26px;font-weight:700;color:#2d2422;margin:0}.result-meta{font-size:17px;color:#b8a097;margin:0}
.retry-btn{margin-top:8px;padding:13px 44px;background:#e8734a;color:#fff;border:none;border-radius:12px;font-size:18px;font-weight:600;cursor:pointer;transition:all .15s}
.retry-btn:hover{background:#d4653a;transform:translateY(-1px)}
.result-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:center}
.retry-btn.secondary{padding:13px 36px;background:#5b9a5e;font-size:16px}
.retry-btn.secondary:hover{background:#4a8a4e}
.retry-btn.outline{padding:13px 36px;background:#fff;color:#c9782d;border:2px solid rgba(232,164,74,.35);font-size:16px}
.retry-btn.outline:hover{background:#fef9f0;border-color:#e8734a;transform:translateY(-1px)}

/* 操作按钮: 跳过=绿色, 结束=红色 */
.btn-skip{color:#10b981;border-color:rgba(16,185,129,.25)}.btn-skip:hover{background:rgba(16,185,129,.07);color:#059669;border-color:rgba(16,185,129,.4)}
.btn-end{padding:5px 16px;background:linear-gradient(135deg,#c94a4a,#b33a3a);color:#fff;border:none;border-radius:8px;font-weight:600;box-shadow:0 2px 6px rgba(201,74,74,.25);transition:all .2s ease}
.btn-end:hover{background:linear-gradient(135deg,#b33a3a,#a02828);transform:translateY(-1px);box-shadow:0 4px 12px rgba(201,74,74,.35)}
.btn-end:active{transform:translateY(0) scale(.96);transition:transform .08s ease}

.sentence-card{flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:0 24px}

/* —— 顶部 —— */
.top-zone{flex-shrink:0;padding-top:20px;max-width:720px;width:100%;margin:0 auto}
.progress-bar{height:3px;background:rgba(184,160,151,.15);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;background:#e8734a;border-radius:2px;transition:width .4s ease}
.card-top-row{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.counter{font-size:16px;color:#b8a097;font-weight:500}
.top-actions{display:flex;gap:6px;align-items:center}
.mini-btn{font-size:15px;color:#b8a097;background:transparent;border:none;cursor:pointer;padding:5px 12px;border-radius:8px;transition:all .15s}
.mini-btn:hover{background:rgba(184,160,151,.06);color:#4a3d39}
.action-btn{display:flex;align-items:center;gap:4px;font-size:15px;color:#b8a097;background:#fef9f4;border:1px solid rgba(184,160,151,.18);cursor:pointer;padding:5px 12px;border-radius:8px;transition:all .15s}
.action-btn:hover{border-color:rgba(184,160,151,.25);color:#2d2422}

/* —— 中间 —— */
.mid-zone{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0}
.chinese-area{padding:0 0 16px;text-align:center}
.chinese-text{font-size:30px;font-weight:600;color:#2d2422;line-height:1.6;margin:0;word-break:break-word}
.slots-area{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:flex-start;padding:0 0 8px}
.slot-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px}
.punct-mark{font-size:19px;color:#b8a097;padding:0 1px;user-select:none;align-self:center}
.hint-above{font-size:14px;color:#e8734a;font-family:monospace;letter-spacing:2px;text-align:center;margin-bottom:4px;background:#fef3ee;border-radius:6px;padding:2px 8px;white-space:nowrap;line-height:1.4}
.slot-input{padding:10px 16px;border:2px solid rgba(184,160,151,.18);border-radius:10px;font-size:19px;text-align:center;outline:0;transition:all .15s;font-family:inherit;min-width:56px;background:#fff;color:#2d2422}
.slot-input:focus{border-color:#e8734a}
.slot-input.correct{border-color:#5b9a5e!important;background:#f3f9f3!important;color:#5b9a5e!important;font-weight:600;cursor:default}
.slot-input.retry{border-color:#e8a44a!important;background:#fef9f0!important;color:#c9782d!important}
.slot-item.shaking .slot-input{animation:shakeRed .5s ease}
@keyframes shakeRed{0%,100%{border-color:rgba(184,160,151,.18)}10%,50%,90%{border-color:#c94a4a;background:#fdf0f0}}

.hover-word-card{position:absolute;bottom:calc(100%+10px);left:50%;transform:translateX(-50%);z-index:200;
  background:#fff;color:#2d2422;padding:10px 14px;border-radius:12px;
  min-width:130px;pointer-events:none;
  box-shadow:0 12px 32px rgba(0,0,0,.1),0 0 0 1px rgba(0,0,0,.04);
  animation:hoverCardIn .2s ease-out;}
.hover-word-card::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:7px solid transparent;border-top-color:#fff}
@keyframes hoverCardIn{0%{opacity:0;transform:translateX(-50%) translateY(6px) scale(.94)}100%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
.hw-top{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.hw-word{font-weight:700;color:#2d2422;font-size:17px}
.hw-pos{font-size:13px;color:#b8a097}
.hw-phonetic{color:#e8734a;font-style:italic;font-size:14px;margin-bottom:2px}
.hw-loading{color:#b8a097;font-size:12px}
.hw-trans{color:#5b9a5e;font-weight:600;font-size:16px}

/* —— 底部 —— */
.bottom-zone{flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:28px;padding:14px 0 18px}
.si-label{font-size:13px;font-weight:600;color:#b8a097;text-transform:uppercase;letter-spacing:1.5px;flex-shrink:0}
.si-items{display:flex;align-items:center;gap:24px}
.si-item{display:inline-flex;align-items:center;gap:4px}
.si-item kbd{display:inline-block;padding:2px 8px;border:1px solid rgba(184,160,151,.18);border-radius:4px;background:rgba(184,160,151,.08);font-size:13px;font-family:inherit;color:#b8a097;font-weight:500;white-space:nowrap}
.si-item span{font-size:13px;color:#b8a097}

@media(max-width:768px){
  .sentence-practice{overflow:auto}
  .topbar{padding:0 16px;height:50px}
  .sentence-card{padding:0 16px}
  .chinese-text{font-size:26px}
  .slot-input{font-size:18px;padding:6px 10px}
  .top-zone{padding-top:14px;max-width:100%}
  .bottom-zone{gap:12px;padding:10px 0 14px}
  .bottom-zone .si-items{gap:10px;flex-wrap:wrap;justify-content:center}
  .bottom-zone .si-label{display:none}
  .top-actions .action-btn span,.top-actions .action-btn{font-size:12px}
}
@media(max-width:360px){
  .chinese-text{font-size:22px}
  .slot-input{font-size:14px;min-width:44px;padding:5px 8px}
  .card-top-row{flex-wrap:wrap;gap:6px}
}
</style>
