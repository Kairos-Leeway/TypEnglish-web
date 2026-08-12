<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

interface SpellingResult {
  word: { word: string; translation?: string; phonetic?: string }
  correct: boolean
  answer: string
  attempts: number
}

interface SentenceResult {
  sentenceId?: number
  english: string
  chinese: string
  correct: boolean
  slots: Array<{ index: number; word: string; visible: boolean; correct: boolean; answer: string }>
}

const props = defineProps<{
  mode: 'spelling' | 'translation' | 'cloze'
  completed: boolean
  isReviewSentence: boolean
  words: any[]
  results: SpellingResult[]
  sentences: any[]
  sentenceResults: SentenceResult[]
  correctCount: number
  totalSlots?: number
}>()

const emit = defineEmits<{
  home: []
  restart: []
  'review-wrong': []
}>()

const showDetails = ref(false)
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const isSentenceMode = computed(() => props.mode === 'translation' || props.mode === 'cloze')

const total = computed(() => {
  if (isSentenceMode.value) return props.sentences.length || props.sentenceResults.length
  return props.words.length || props.results.length
})

const wrong = computed(() => {
  if (isSentenceMode.value) return props.sentenceResults.filter((r) => !r.correct).length
  return props.results.filter((r) => !r.correct).length
})

const accuracy = computed(() => {
  const t = total.value
  if (!t) return 0
  const c = t - wrong.value
  return Math.round((c / t) * 100)
})

const ringCircumference = 2 * Math.PI * 52
const ringOffset = computed(() => ringCircumference * (1 - accuracy.value / 100))

const gradeText = computed(() => {
  const a = accuracy.value
  if (a >= 90) return '太棒了！'
  if (a >= 75) return '做得不错'
  if (a >= 60) return '继续加油'
  return '再接再厉'
})

const gradeClass = computed(() => {
  const a = accuracy.value
  if (a >= 90) return 'excellent'
  if (a >= 75) return 'good'
  if (a >= 60) return 'pass'
  return 'need-work'
})

const listItems = computed(() => {
  if (isSentenceMode.value) {
    return props.sentenceResults.map((r) => {
      const blanks = r.slots.filter((s) => !s.visible)
      const correctCount = blanks.filter((s) => s.correct).length
      return {
        label: r.english,
        sub: r.chinese,
        correct: r.correct,
        answer: r.correct ? '' : `${correctCount}/${blanks.length} 空正确`,
        expected: r.english,
      }
    })
  }
  return props.results.map((r) => ({
    label: r.word.word,
    sub: r.word.translation || '',
    correct: r.correct,
    answer: r.answer,
    expected: r.word.word,
  }))
})
</script>

<template>
  <div class="round-result" :class="{ mounted }">
    <div class="result-card">
      <div class="result-head">
        <div class="result-icon" :class="gradeClass">
          <svg v-if="completed" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
        </div>
        <div>
          <h2>{{ completed ? '练习完成' : '已结束' }}</h2>
          <p class="grade-label" :class="gradeClass">{{ gradeText }}</p>
        </div>
      </div>

      <!-- accuracy ring -->
      <div class="accuracy-ring">
        <svg width="160" height="160" viewBox="0 0 120 120">
          <circle class="ring-bg" cx="60" cy="60" r="52" />
          <circle
            class="ring-fill"
            :class="gradeClass"
            cx="60"
            cy="60"
            r="52"
            :stroke-dasharray="ringCircumference"
            :stroke-dashoffset="ringOffset"
          />
        </svg>
        <div class="ring-center">
          <span class="ring-num">{{ accuracy }}</span>
          <span class="ring-pct">%</span>
        </div>
      </div>

      <!-- stats -->
      <div class="stats-row">
        <div class="stat">
          <span class="stat-num">{{ total }}</span>
          <span class="stat-label">总计</span>
        </div>
        <div class="stat ok">
          <span class="stat-num">{{ total - wrong }}</span>
          <span class="stat-label">正确</span>
        </div>
        <div class="stat err">
          <span class="stat-num">{{ wrong }}</span>
          <span class="stat-label">错误</span>
        </div>
      </div>

      <!-- detail toggle -->
      <button class="detail-toggle" @click="showDetails = !showDetails">
        <span>{{ showDetails ? '收起详情' : '查看对错明细' }}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ open: showDetails }">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- detail list -->
      <Transition name="details">
        <div v-show="showDetails" class="detail-list">
          <div v-for="(item, i) in listItems" :key="i" class="detail-item" :class="{ ok: item.correct, err: !item.correct }">
            <div class="detail-main">
              <span class="detail-status">
                <svg v-if="item.correct" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
              <div class="detail-text">
                <span class="detail-word">{{ item.label }}</span>
                <span v-if="item.sub" class="detail-sub">{{ item.sub }}</span>
              </div>
            </div>
            <div class="detail-answer">
              <span v-if="!item.correct && item.answer" class="wrong-answer">{{ item.answer }}</span>
              <span v-if="!isSentenceMode" class="expected">{{ item.expected }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <!-- actions -->
      <div class="result-actions">
        <button v-if="isReviewSentence" class="action-btn primary" @click="emit('home')">返回错题本</button>
        <button v-else class="action-btn primary" @click="emit('home')">返回首页</button>
        <button class="action-btn secondary" @click="emit('restart')">再来一轮</button>
        <button v-if="wrong > 0 && mode === 'spelling'" class="action-btn outline" @click="emit('review-wrong')">
          复习错题 ({{ wrong }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.round-result {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  overflow-y: auto;
}

.result-card {
  width: 100%;
  max-width: 620px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 28px;
  padding: 36px 32px 32px;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  opacity: 0;
  transform: translateY(24px) scale(0.96);
  transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.mounted .result-card {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 22px;
  text-align: left;
}
.result-head h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #1d1d1f;
}
.result-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.result-icon.excellent { background: #f0f9f0; color: #248a3d; }
.result-icon.good { background: #f6f3fe; color: #4340b8; }
.result-icon.pass { background: #fef8ec; color: #b57d1f; }
.result-icon.need-work { background: #fff0ef; color: #d6281e; }

.grade-label {
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 600;
}
.grade-label.excellent { color: #248a3d; }
.grade-label.good { color: #4340b8; }
.grade-label.pass { color: #b57d1f; }
.grade-label.need-work { color: #d6281e; }

.accuracy-ring {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 0 auto 24px;
}
.ring-bg {
  fill: none;
  stroke: rgba(0, 0, 0, 0.12);
  stroke-width: 9;
  stroke-linecap: round;
}
.ring-fill {
  fill: none;
  stroke-width: 9;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  transition: stroke-dashoffset 1.2s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.ring-fill.excellent { stroke: #34c759; }
.ring-fill.good { stroke: #5856d6; }
.ring-fill.pass { stroke: #ff9500; }
.ring-fill.need-work { stroke: #ff3b30; }
.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.ring-num {
  font-size: 48px;
  font-weight: 800;
  color: #1d1d1f;
  line-height: 1;
}
.ring-pct {
  font-size: 18px;
  font-weight: 600;
  color: #86868b;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 36px;
  margin-bottom: 24px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: #1d1d1f;
}
.stat-label {
  font-size: 13px;
  color: #86868b;
  font-weight: 500;
}
.stat.ok .stat-num { color: #34c759; }
.stat.err .stat-num { color: #ff3b30; }

.detail-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 auto 16px;
  padding: 8px 16px;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 20px;
  color: #6e6e73;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.detail-toggle:hover {
  background: rgba(0, 0, 0, 0.14);
  color: #1d1d1f;
}
.detail-toggle svg {
  transition: transform 0.25s ease;
}
.detail-toggle svg.open {
  transform: rotate(180deg);
}

.detail-list {
  max-height: 280px;
  overflow-y: auto;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.05);
  padding: 10px;
  margin-bottom: 24px;
}
.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  transition: background 0.15s;
}
.detail-item:hover {
  background: rgba(255, 255, 255, 0.5);
}
.detail-item.ok .detail-status { color: #34c759; background: #f2fff4; }
.detail-item.err .detail-status { color: #ff3b30; background: #fff0ef; }
.detail-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.detail-status {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.detail-word {
  font-size: 15px;
  font-weight: 600;
  color: #1d1d1f;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.detail-sub {
  font-size: 12px;
  color: #86868b;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.detail-answer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}
.wrong-answer {
  font-size: 13px;
  color: #ff3b30;
  text-decoration: line-through;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.expected {
  font-size: 15px;
  font-weight: 600;
  color: #34c759;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.action-btn {
  padding: 13px 28px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: all 0.15s;
}
.action-btn:hover { transform: translateY(-1px); }
.action-btn.primary {
  background: #ff7a50;
  color: #fff;
}
.action-btn.primary:hover { background: #ff5722; }
.action-btn.secondary {
  background: #34c759;
  color: #fff;
}
.action-btn.secondary:hover { background: #2ea043; }
.action-btn.outline {
  background: #fff;
  color: #ff9500;
  border: 2px solid rgba(232, 164, 74, 0.35);
}
.action-btn.outline:hover { background: #fef9f0; border-color: #ff7a50; }

.details-enter-active,
.details-leave-active {
  transition: all 0.3s ease;
  max-height: 280px;
  opacity: 1;
}
.details-enter-from,
.details-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
  overflow: hidden;
}

@media (max-width: 640px) {
  .result-card {
    padding: 28px 20px 24px;
    border-radius: 22px;
  }
  .stats-row { gap: 24px; }
  .result-actions { gap: 10px; }
  .action-btn { padding: 12px 20px; font-size: 15px; }
  .detail-item { flex-direction: column; align-items: flex-start; gap: 6px; }
  .detail-answer { align-items: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .result-card { transition: none; }
  .ring-fill { transition: none; }
}
</style>
